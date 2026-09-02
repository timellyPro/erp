import prisma from "@/lib/db";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import {
  buildFeeDueReportPayload,
  fillMissingClassFeeStructuresFromSiblings,
  type ExtraFeeLite,
  type StudentFeeDueInput,
} from "@/lib/feeDueReportCompute";
import { roundRupee } from "@/lib/formatRupee";
import { activeStudentWhere } from "@/lib/studentStatus";

export type CurrentPreviousFeeSummaryStats = {
  totalStudents: number;
  totalFee: number;
  totalCollected: number;
  totalDue: number;
  totalDiscount: number;
  previousYearTotalFee: number;
  previousYearCollected: number;
  previousYearDue: number;
  pending: number;
  paid: number;
};

export async function computeCurrentAndPreviousFeeStats(
  schoolId: string
): Promise<CurrentPreviousFeeSummaryStats> {
  const [fees, structuresRaw, extraFeesRaw, classesMeta] = await Promise.all([
    prisma.studentFee.findMany({
      where: { student: { schoolId, ...activeStudentWhere } },
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
    }),
    prisma.classFeeStructure.findMany({
      where: { schoolId },
      select: { classId: true, components: true },
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
    prisma.class.findMany({
      where: { schoolId },
      select: { id: true, name: true, section: true },
    }),
  ]);

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
    const key = `${studentId}|${headKey}`;
    netPaidByStudentHead.set(key, (netPaidByStudentHead.get(key) ?? 0) + delta);
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

  const componentsByClassId = new Map<string, Array<{ name: string; amount: number }>>();
  for (const s of structuresRaw) {
    const comps = (Array.isArray(s.components) ? (s.components as unknown[]) : []).map((c) => ({
      name: String((c as { name?: string })?.name ?? "Component"),
      amount: Number((c as { amount?: number })?.amount) || 0,
    }));
    componentsByClassId.set(s.classId, comps);
  }
  fillMissingClassFeeStructuresFromSiblings(componentsByClassId, classesMeta);

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

  const students: StudentFeeDueInput[] = fees.map((f) => {
    const cls = f.student.class;
    return {
      studentId: f.student.id,
      classId: cls?.id ?? null,
      section: cls?.section ?? null,
      classDisplay: cls ? `${cls.name}${cls.section ? ` - ${cls.section}` : ""}`.trim() : "-",
      totalFee: f.totalFee,
      finalFee: f.finalFee,
      amountPaid: f.amountPaid,
      remainingFee: f.remainingFee,
      discountPercent: f.discountPercent,
      discountFeeHeadKey: f.discountFeeHeadKey,
      discountFeeHeadLabel: f.discountFeeHeadLabel,
      name: f.student.user?.name ?? null,
      admissionNo: f.student.admissionNumber,
      parent: f.student.fatherName?.trim() || "-",
      mobile: f.student.phoneNo?.trim() || "-",
      category: f.student.residencyType,
    };
  });

  const payload = buildFeeDueReportPayload({
    schoolName: null,
    extraFees,
    students,
    netPaidByStudentHead,
    componentsByClassId,
    includeSchoolWideExtras: true,
    extraFeesById: new Map(extraFees.map((e) => [e.id, { id: e.id, name: e.name }])),
  });

  const totalFee = roundRupee(payload.rows.reduce((sum, row) => sum + row.totalFee, 0));
  const totalDiscount = roundRupee(payload.rows.reduce((sum, row) => sum + row.totalDiscount, 0));
  const totalCollected = roundRupee(payload.rows.reduce((sum, row) => sum + row.feesPaid, 0));
  const totalDue = roundRupee(payload.rows.reduce((sum, row) => sum + row.feesDue, 0));
  const previousYearTotalFee = roundRupee(
    payload.rows.reduce((sum, row) => sum + (row.previousYearTotalFee ?? 0), 0)
  );
  const previousYearCollected = roundRupee(
    payload.rows.reduce((sum, row) => sum + (row.previousYearFeesPaid ?? 0), 0)
  );
  const previousYearDue = roundRupee(
    payload.rows.reduce((sum, row) => sum + (row.previousYearFeesDue ?? 0), 0)
  );

  return {
    totalStudents: payload.rows.length,
    totalFee,
    totalCollected,
    totalDue,
    totalDiscount,
    previousYearTotalFee,
    previousYearCollected,
    previousYearDue,
    pending: payload.rows.filter((row) => row.feesDue > 0.01).length,
    paid: payload.rows.filter((row) => row.feesDue <= 0.01).length,
  };
}
