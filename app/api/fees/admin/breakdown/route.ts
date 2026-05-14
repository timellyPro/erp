import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { redistributeBaseMinusOneAllocations } from "@/lib/redistributeBaseMinusOneAllocations";
import { structureMultiplierAfterDiscount, shouldOmitLegacySplitHostelMessExtraForBreakdown } from "@/lib/studentTuitionFromStructure";
import { extraFeeAppliesToStudentResidency } from "@/lib/extraFeeResidencyScope";
import { isStudentRte, isTuitionNamedExtraFee } from "@/lib/studentRte";
import { shouldSplitFeeHeadIntoTwoInstallments } from "@/lib/feeHeadInstallmentSplit";

function normalizeExtraFeeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stale `npx prisma generate` (or DB without migration) — Prisma rejects unknown select fields. */
function isUnknownExtraFeeSplitFieldError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientValidationError) {
    return (
      error.message.includes("Unknown field") && error.message.includes("splitIntoTwoInstallments")
    );
  }
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("Unknown field") && msg.includes("splitIntoTwoInstallments");
}

/** Prefer student-specific over section/class/school when the same fee name+amount appears twice (duplicate assignments). */
function dedupeExtraFeesForStudent<
  T extends {
    id: string;
    name: string;
    amount: number;
    targetType: string;
    targetStudentId: string | null;
    splitIntoTwoInstallments?: boolean;
  }
>(fees: T[], studentId: string): T[] {
  const priority = (f: T) => {
    if (f.targetType === "STUDENT" && f.targetStudentId === studentId) return 4;
    if (f.targetType === "SECTION") return 3;
    if (f.targetType === "CLASS") return 2;
    if (f.targetType === "SCHOOL") return 1;
    return 0;
  };
  const best = new Map<string, T>();
  for (const f of fees) {
    const amt = Math.round((Number(f.amount) || 0) * 100) / 100;
    const key = `${normalizeExtraFeeName(f.name)}|${amt}`;
    const cur = best.get(key);
    if (!cur || priority(f) > priority(cur)) best.set(key, f);
  }
  return Array.from(best.values());
}

async function getSchoolId(session: { user: { id: string; schoolId?: string | null } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  if (!schoolId) {
    const teacherClass = await prisma.class.findFirst({
      where: { teacherId: session.user.id },
      select: { schoolId: true },
    });
    schoolId = teacherClass?.schoolId ?? null;
  }
  if (!schoolId) {
    const teacherSchool = await prisma.school.findFirst({
      where: { teachers: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = teacherSchool?.id ?? null;
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
      extraFeeId: string;
      /** Only student-assigned extras can be removed from this profile without affecting others. */
      canDeleteOnStudentProfile: boolean;
      /** When true, UI may show this head as two 50/50 installments. */
      splitIntoTwoInstallments: boolean;
    };

type InternalHead =
  | { key: string; headType: "BASE_COMPONENT"; label: string; snapshotDue: number }
  | {
      key: string;
      headType: "EXTRA_FEE";
      label: string;
      snapshotDue: number;
      extraFeeId: string;
      canDeleteOnStudentProfile: boolean;
      splitIntoTwoInstallments: boolean;
    };

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const canManageFees =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManageFees) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

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
        residencyType: true,
        fee: {
          select: {
            amountPaid: true,
            finalFee: true,
            totalFee: true,
            discountPercent: true,
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

    const structMult = structureMultiplierAfterDiscount(fee.discountPercent);

    const classId = student.class?.id ?? null;
    const classSection = student.class?.section ?? null;

    const extraFeeWhere = {
      schoolId,
      OR: [
        { targetType: "SCHOOL" as const },
        ...(classId ? [{ targetType: "CLASS" as const, targetClassId: classId }] : []),
        ...(classId && classSection
          ? [{ targetType: "SECTION" as const, targetClassId: classId, targetSection: classSection }]
          : []),
        { targetType: "STUDENT" as const, targetStudentId: student.id },
      ],
    };

    const extraFeeSelectBase = {
      id: true,
      name: true,
      amount: true,
      targetType: true,
      targetClassId: true,
      targetSection: true,
      targetStudentId: true,
      residencyScope: true,
    } as const;

    type ExtraFeeBreakdownRow = {
      id: string;
      name: string;
      amount: number;
      targetType: string;
      targetClassId: string | null;
      targetSection: string | null;
      targetStudentId: string | null;
      residencyScope: string;
      splitIntoTwoInstallments?: boolean;
    };

    let extraFeesRaw: ExtraFeeBreakdownRow[];
    try {
      extraFeesRaw = await prisma.extraFee.findMany({
        where: extraFeeWhere,
        // After `prisma generate`, this field exists on the client. Cast until CI/local client is regenerated.
        select: { ...extraFeeSelectBase, splitIntoTwoInstallments: true } as typeof extraFeeSelectBase & {
          splitIntoTwoInstallments: true;
        },
      });
    } catch (e) {
      if (!isUnknownExtraFeeSplitFieldError(e)) throw e;
      console.warn(
        "[fees/admin/breakdown] ExtraFee.splitIntoTwoInstallments unavailable on this Prisma client or DB. " +
          "Using name-based installment rules only until you run: npx prisma db push && npx prisma generate " +
          "(stop `npm run dev` first on Windows if generate fails with EPERM)."
      );
      const rows = await prisma.extraFee.findMany({
        where: extraFeeWhere,
        select: extraFeeSelectBase,
      });
      extraFeesRaw = rows.map((r) => ({
        ...r,
        splitIntoTwoInstallments: shouldSplitFeeHeadIntoTwoInstallments(r.name),
      }));
    }
    const residency = student.residencyType ?? "Day Scholar";
    const rte = isStudentRte(residency);
    const extraFees = dedupeExtraFeesForStudent(
      extraFeesRaw.filter((ef) => extraFeeAppliesToStudentResidency(ef.residencyScope, residency)),
      student.id
    )
      .filter(
        (ef) =>
          !shouldOmitLegacySplitHostelMessExtraForBreakdown(ef, extraFeesRaw, {
            classId,
            residencyType: residency,
          })
      )
      .filter((ef) => !(rte && isTuitionNamedExtraFee(ef.name)));

    const allHeads: InternalHead[] = [
      ...baseComps.map(
        (c, idx): InternalHead => ({
          key: `BASE:${idx}`,
          headType: "BASE_COMPONENT",
          label: c.name,
          snapshotDue: rte ? 0 : c.amount * structMult,
        })
      ),
      ...extraFees.map(
        (ef): InternalHead => ({
          key: `EXTRA:${ef.id}`,
          headType: "EXTRA_FEE",
          label: ef.name,
          snapshotDue: Number(ef.amount) || 0,
          extraFeeId: ef.id,
          canDeleteOnStudentProfile:
            ef.targetType === "STUDENT" && ef.targetStudentId === student.id,
          splitIntoTwoInstallments: Boolean(ef.splitIntoTwoInstallments),
        })
      ),
    ];

    // Net already-paid by head via allocations (new payments only).
    const [paymentAllocations, refundAllocations] = await Promise.all([
      prisma.paymentFeeAllocation.groupBy({
        by: ["headType", "componentIndex", "extraFeeId"],
        where: {
          studentId: student.id,
          allocationType: "PAYMENT",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        _sum: { allocatedAmount: true },
      }),
      prisma.paymentFeeAllocation.groupBy({
        by: ["headType", "componentIndex", "extraFeeId"],
        where: {
          studentId: student.id,
          allocationType: "REFUND",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
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

    redistributeBaseMinusOneAllocations(netPaidByHead, allHeads);

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
        extraFeeId: h.extraFeeId,
        canDeleteOnStudentProfile: h.canDeleteOnStudentProfile,
        splitIntoTwoInstallments: h.splitIntoTwoInstallments,
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

