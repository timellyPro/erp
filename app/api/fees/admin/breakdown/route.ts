import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

async function getSchoolId(session: { user: { id: string; schoolId?: string | null } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  return schoolId;
}

type HeadDueResponse =
  | {
      key: string;
      headType: "BASE_COMPONENT";
      label: string;
      snapshotAmount: number;
      dueBefore: number;
    }
  | {
      key: string;
      headType: "EXTRA_FEE";
      label: string;
      snapshotAmount: number;
      dueBefore: number;
    };

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  try {
    const schoolId = await getSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId")?.trim();
    if (!studentId) return NextResponse.json({ message: "studentId is required" }, { status: 400 });

    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: {
        id: true,
        fee: {
          select: {
            amountPaid: true,
            finalFee: true,
          },
        },
        class: {
          select: {
            id: true,
            section: true,
          },
        },
      },
    });
    if (!student) return NextResponse.json({ message: "Student not found in your school" }, { status: 404 });
    if (!student.fee) return NextResponse.json({ message: "Fee record not found for this student" }, { status: 404 });

    const fee = student.fee;

    const classFeeStructure = student.class?.id
      ? await prisma.classFeeStructure.findUnique({
          where: { classId: student.class.id },
          select: { components: true },
        })
      : null;

    const baseComps =
      ((classFeeStructure?.components as Array<{ name: string; amount: number }> | null) ?? []).map((c) => ({
        name: c.name,
        amount: Number(c.amount) || 0,
      }));

    const classId = student.class?.id ?? null;
    const classSection = student.class?.section ?? null;

    const extraFees = await prisma.extraFee.findMany({
      where: {
        schoolId,
        OR: [
          { targetType: "SCHOOL" },
          ...(classId ? [{ targetType: "CLASS", targetClassId: classId }] : []),
          ...(classId && classSection
            ? [{ targetType: "SECTION", targetClassId: classId, targetSection: classSection }]
            : []),
          { targetType: "STUDENT", targetStudentId: student.id },
        ],
      },
      select: { id: true, name: true, amount: true },
    });

    const allHeads = [
      {
        key: `BASE:-1`,
        headType: "BASE_COMPONENT" as const,
        label: "Tuition Fee",
        snapshotDue: Math.max(fee.finalFee, 0),
      },
      ...baseComps.map((c, idx) => ({
        key: `BASE:${idx}`,
        headType: "BASE_COMPONENT" as const,
        label: c.name,
        snapshotDue: c.amount,
      })),
      ...extraFees.map((ef) => ({
        key: `EXTRA:${ef.id}`,
        headType: "EXTRA_FEE" as const,
        label: ef.name,
        snapshotDue: Number(ef.amount) || 0,
      })),
    ];

    // Net already-paid by head via allocations (new payments only).
    const [paymentAllocations, refundAllocations] = await Promise.all([
      prisma.paymentFeeAllocation.groupBy({
        by: ["headType", "componentIndex", "extraFeeId"],
        where: { studentId: student.id, allocationType: "PAYMENT", payment: { status: "SUCCESS" } },
        _sum: { allocatedAmount: true },
      }),
      prisma.paymentFeeAllocation.groupBy({
        by: ["headType", "componentIndex", "extraFeeId"],
        where: { studentId: student.id, allocationType: "REFUND", payment: { status: "SUCCESS" } },
        _sum: { allocatedAmount: true },
      }),
    ]);

    const netPaidByHead = new Map<string, number>();
    for (const a of paymentAllocations) {
      const key = a.headType === "BASE_COMPONENT" ? `BASE:${a.componentIndex}` : `EXTRA:${a.extraFeeId}`;
      netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) + (a._sum.allocatedAmount ?? 0));
    }
    for (const a of refundAllocations) {
      const key = a.headType === "BASE_COMPONENT" ? `BASE:${a.componentIndex}` : `EXTRA:${a.extraFeeId}`;
      netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) - (a._sum.allocatedAmount ?? 0));
    }

    const allocationsNetTotal = Array.from(netPaidByHead.values()).reduce((s, v) => s + v, 0);
    const legacyPaidTotal = Math.max(fee.amountPaid - allocationsNetTotal, 0);
    const totalSnapshotDue = Math.max(allHeads.reduce((s, h) => s + h.snapshotDue, 0), 0);

    const headsDue: HeadDueResponse[] = allHeads.map((h) => {
      const paidAlloc = netPaidByHead.get(h.key) ?? 0;
      const paidLegacy = totalSnapshotDue > 0 ? legacyPaidTotal * (h.snapshotDue / totalSnapshotDue) : 0;
      const paidBefore = Math.max(paidAlloc + paidLegacy, 0);
      const dueBefore = Math.max(h.snapshotDue - paidBefore, 0);

      if (h.headType === "BASE_COMPONENT") {
        return {
          key: h.key,
          headType: "BASE_COMPONENT",
          label: h.label,
          snapshotAmount: h.snapshotDue,
          dueBefore,
        };
      }
      return {
        key: h.key,
        headType: "EXTRA_FEE",
        label: h.label,
        snapshotAmount: h.snapshotDue,
        dueBefore,
      };
    });

    const totalDueBefore = headsDue.reduce((s, h) => s + h.dueBefore, 0);
    const totalAmount = headsDue.reduce((s, h) => s + h.snapshotAmount, 0);
    return NextResponse.json(
      {
        studentId: student.id,
        remainingFee: totalDueBefore,
        totalAmount,
        amountPaid: fee.amountPaid,
        finalFee: fee.finalFee,
        dueHeads: headsDue,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Admin fee breakdown error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

