import { tenantDb as prisma } from "@/lib/db/tenantContext";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/fees/feePaymentStatuses";
import {
  buildFeeDueReportPayload,
  fillMissingClassFeeStructuresFromSiblings,
  type ExtraFeeLite,
  type StudentFeeDueInput,
} from "@/lib/fees/feeDueReportCompute";
import {
  aggregateRowByHead,
  DUE_HEAD_LABELS,
  DUE_HEAD_ORDER,
  type DueHeadCell,
  type DueHeadKey,
} from "@/lib/fees/feeDueTemplateHeads";

export type StudentDueReportHead = DueHeadCell & { key: DueHeadKey; label: string };

export type StudentFeeDueReport = {
  generatedAt: string;
  studentName: string;
  className: string;
  admissionNo: string;
  category: string;
  /** Current-year heads that have any amount, in the school's usual order. */
  heads: StudentDueReportHead[];
  /** Current-year totals: same as the Total fees / Total discount / Fees paid / Fees Due columns of the due report. */
  totals: { fee: number; discount: number; paid: number; due: number };
  /** Dues carried over from earlier years, kept out of the totals above, as in the due report. */
  previousYear: DueHeadCell | null;
};

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * One student's fee due report, computed by the very same engine as the school admin's Fee Due Report
 * (so the figures cannot disagree with it), then added up into Hostel / Mess / Bus / Tuition / Admission.
 * Call inside `runInTenantScope(schoolId, ...)`; every query below is also filtered by schoolId.
 */
export async function buildStudentFeeDueReport(
  schoolId: string,
  studentId: string
): Promise<StudentFeeDueReport | null> {
  const fee = await prisma.studentFee.findFirst({
    where: { studentId, student: { schoolId } },
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
  });
  if (!fee) return null;

  const [school, structures, extraFeesRaw, classesMeta, payAllocs, refundAllocs] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    prisma.classFeeStructure.findMany({ where: { schoolId } }),
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
        residencyConversion: true,
      },
    }),
    prisma.class.findMany({ where: { schoolId }, select: { id: true, name: true, section: true } }),
    prisma.paymentFeeAllocation.findMany({
      where: { studentId, allocationType: "PAYMENT", payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } } },
      select: { studentId: true, headType: true, componentIndex: true, extraFeeId: true, allocatedAmount: true },
    }),
    prisma.paymentFeeAllocation.findMany({
      where: { studentId, allocationType: "REFUND", payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } } },
      select: { studentId: true, headType: true, componentIndex: true, extraFeeId: true, allocatedAmount: true },
    }),
  ]);

  const extraFees: ExtraFeeLite[] = extraFeesRaw.map((e) => ({ ...e }));
  const componentsByClassId = new Map<string, Array<{ name: string; amount: number }>>();
  for (const s of structures) {
    const comps = (Array.isArray(s.components) ? (s.components as unknown[]) : []).map((c) => ({
      name: String((c as { name?: string })?.name ?? "Component"),
      amount: Number((c as { amount?: number })?.amount) || 0,
    }));
    componentsByClassId.set(s.classId, comps);
  }
  fillMissingClassFeeStructuresFromSiblings(componentsByClassId, classesMeta);

  const netPaid = new Map<string, number>();
  const add = (headKey: string, delta: number) => {
    const k = `${studentId}|${headKey}`;
    netPaid.set(k, (netPaid.get(k) ?? 0) + delta);
  };
  for (const [list, sign] of [[payAllocs, 1], [refundAllocs, -1]] as const) {
    for (const a of list) {
      if (a.headType === "BASE_COMPONENT") {
        if (typeof a.componentIndex === "number") add(`BASE:${a.componentIndex}`, sign * a.allocatedAmount);
      } else if (a.headType === "EXTRA_FEE" && a.extraFeeId) {
        add(`EXTRA:${a.extraFeeId}`, sign * a.allocatedAmount);
      }
    }
  }

  const st = fee.student;
  const cls = st.class;
  const classDisplay = cls ? `${cls.name}${cls.section ? ` - ${cls.section}` : ""}`.trim() : "-";
  const input: StudentFeeDueInput = {
    studentId: st.id,
    classId: cls?.id ?? null,
    section: cls?.section ?? null,
    classDisplay,
    totalFee: fee.totalFee,
    finalFee: fee.finalFee,
    amountPaid: fee.amountPaid,
    remainingFee: fee.remainingFee,
    discountPercent: fee.discountPercent,
    discountFeeHeadKey: fee.discountFeeHeadKey,
    discountFeeHeadLabel: fee.discountFeeHeadLabel,
    name: st.user?.name ?? null,
    admissionNo: st.admissionNumber,
    parent: st.fatherName?.trim() || "-",
    mobile: st.phoneNo?.trim() || "-",
    category: st.residencyType,
  };

  const payload = buildFeeDueReportPayload({
    schoolName: school?.name ?? null,
    extraFees,
    students: [input],
    netPaidByStudentHead: netPaid,
    componentsByClassId,
    includeSchoolWideExtras: true,
    extraFeesById: new Map(extraFees.map((e) => [e.id, { id: e.id, name: e.name }])),
  });
  const row = payload.rows[0];
  if (!row) return null;

  const byHead = aggregateRowByHead(row, payload.groups);
  const heads: StudentDueReportHead[] = DUE_HEAD_ORDER.filter((k) => k !== "previousYear")
    .map((key) => ({ key, label: DUE_HEAD_LABELS[key], ...roundCell(byHead[key]) }))
    .filter((h) => h.fee !== 0 || h.concession !== 0 || h.paid !== 0 || h.due !== 0);

  const prev = roundCell(byHead.previousYear);
  const hasPrev = prev.fee !== 0 || prev.concession !== 0 || prev.paid !== 0 || prev.due !== 0;

  return {
    generatedAt: payload.generatedAt,
    studentName: row.name,
    className: classDisplay,
    admissionNo: row.admissionNo,
    category: row.category,
    heads,
    totals: { fee: row.totalFee, discount: row.totalDiscount, paid: row.feesPaid, due: row.feesDue },
    previousYear: hasPrev ? prev : null,
  };
}

function roundCell(c: DueHeadCell): DueHeadCell {
  return { fee: r2(c.fee), concession: r2(c.concession), paid: r2(c.paid), due: r2(c.due) };
}
