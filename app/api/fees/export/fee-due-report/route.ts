import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";
import {
  buildFeeDueReportPayload,
  type ExtraFeeLite,
  type StudentFeeDueInput,
} from "@/lib/feeDueReportCompute";
import { buildFeeDueReportWorkbook } from "@/lib/feeDueReportExcel";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found in session" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const classIdFilter = searchParams.get("classId")?.trim() || undefined;
    const includeSchoolWideExtras =
      searchParams.get("schoolWideExtras") === "1" || searchParams.get("schoolWideExtras") === "true";

    const [school, fees, structuresRaw, extraFeesRaw] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
      prisma.studentFee.findMany({
        where: {
          student: {
            schoolId,
            ...(classIdFilter ? { classId: classIdFilter } : {}),
          },
        },
        include: {
          student: {
            select: {
              id: true,
              admissionNumber: true,
              fatherName: true,
              phoneNo: true,
              residencyType: true,
              class: { select: { id: true, name: true, section: true } },
              user: { select: { name: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.classFeeStructure.findMany({
        where: { schoolId },
        include: { class: { select: { name: true, section: true } } },
      }),
      prisma.extraFee.findMany({
        where: { schoolId },
        select: {
          id: true,
          name: true,
          amount: true,
          targetType: true,
          targetClassId: true,
          targetSection: true,
          targetStudentId: true,
          residencyScope: true,
        },
      }),
    ]);

    const extraFees: ExtraFeeLite[] = extraFeesRaw.map((e) => ({
      id: e.id,
      name: e.name,
      amount: e.amount,
      targetType: e.targetType,
      targetClassId: e.targetClassId,
      targetSection: e.targetSection,
      targetStudentId: e.targetStudentId,
      residencyScope: e.residencyScope,
    }));

    const componentsByClassId = new Map<string, Array<{ name: string; amount: number }>>();
    for (const s of structuresRaw) {
      const comps = (Array.isArray(s.components) ? (s.components as unknown[]) : []).map((c) => ({
        name: String((c as { name?: string })?.name ?? "Component"),
        amount: Number((c as { amount?: number })?.amount) || 0,
      }));
      componentsByClassId.set(s.classId, comps);
    }

    const studentIds = fees.map((f) => f.studentId);

    const [paymentAllocs, refundAllocs] =
      studentIds.length === 0
        ? [[], []]
        : await Promise.all([
            prisma.paymentFeeAllocation.findMany({
              where: {
                studentId: { in: studentIds },
                allocationType: "PAYMENT",
                payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
              },
              select: {
                studentId: true,
                headType: true,
                componentIndex: true,
                extraFeeId: true,
                allocatedAmount: true,
              },
            }),
            prisma.paymentFeeAllocation.findMany({
              where: {
                studentId: { in: studentIds },
                allocationType: "REFUND",
                payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
              },
              select: {
                studentId: true,
                headType: true,
                componentIndex: true,
                extraFeeId: true,
                allocatedAmount: true,
              },
            }),
          ]);

    const netPaidByStudentHead = new Map<string, number>();
    const addNet = (studentId: string, headKey: string, delta: number) => {
      const composed = `${studentId}|${headKey}`;
      netPaidByStudentHead.set(composed, (netPaidByStudentHead.get(composed) ?? 0) + delta);
    };

    for (const a of paymentAllocs) {
      if (a.headType === "BASE_COMPONENT") {
        if (typeof a.componentIndex !== "number") continue;
        addNet(a.studentId, `BASE:${a.componentIndex}`, a.allocatedAmount);
      } else if (a.headType === "EXTRA_FEE" && a.extraFeeId) {
        addNet(a.studentId, `EXTRA:${a.extraFeeId}`, a.allocatedAmount);
      }
    }
    for (const a of refundAllocs) {
      if (a.headType === "BASE_COMPONENT") {
        if (typeof a.componentIndex !== "number") continue;
        addNet(a.studentId, `BASE:${a.componentIndex}`, -a.allocatedAmount);
      } else if (a.headType === "EXTRA_FEE" && a.extraFeeId) {
        addNet(a.studentId, `EXTRA:${a.extraFeeId}`, -a.allocatedAmount);
      }
    }

    const students: StudentFeeDueInput[] = fees.map((f) => {
      const st = f.student;
      const cls = st.class;
      const classDisplay = cls
        ? `${cls.name}${cls.section ? ` - ${cls.section}` : ""}`.trim()
        : "-";
      return {
        studentId: st.id,
        classId: cls?.id ?? null,
        section: cls?.section ?? null,
        classDisplay,
        totalFee: f.totalFee,
        finalFee: f.finalFee,
        amountPaid: f.amountPaid,
        remainingFee: f.remainingFee,
        discountPercent: f.discountPercent,
        name: st.user?.name ?? null,
        admissionNo: st.admissionNumber,
        parent: st.fatherName?.trim() || "-",
        mobile: st.phoneNo?.trim() || "-",
        category: st.residencyType,
      };
    });

    const payload = buildFeeDueReportPayload({
      schoolName: school?.name ?? null,
      extraFees,
      students,
      netPaidByStudentHead,
      componentsByClassId,
      includeSchoolWideExtras,
    });

    const workbook = await buildFeeDueReportWorkbook(payload);
    const buf = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer));

    const date = new Date().toISOString().slice(0, 10);
    const filename = `fee-due-report-${date}.xlsx`;

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    console.error("Fee due report export error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
