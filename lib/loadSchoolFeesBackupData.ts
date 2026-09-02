import prisma from "@/lib/db";
import type { DayReportTx } from "@/lib/feeDayReportExcel";
import { loadAdmissionFeeDayReportTransactions } from "@/lib/loadAdmissionFeeDayReportTx";
import {
  resolvePaymentCollectorDisplayName,
  userCollectorDisplayLabel,
} from "@/lib/paymentCollectorLabel";
import { FEE_COLLECTION_PAYMENT_WHERE } from "@/lib/schoolDashboardCollection";
import {
  buildFeeDueReportPayload,
  fillMissingClassFeeStructuresFromSiblings,
  type ExtraFeeLite,
  type StudentFeeDueInput,
} from "@/lib/feeDueReportCompute";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { roundRupee } from "@/lib/formatRupee";

function discountAmountFromRow(row: {
  totalFee: number;
  finalFee: number;
  discountFixedAmount?: number | null;
}): number {
  if (typeof row.discountFixedAmount === "number" && row.discountFixedAmount > 0) {
    return roundRupee(row.discountFixedAmount);
  }
  return roundRupee(Math.max(0, row.totalFee - row.finalFee));
}

function mapApprovalDiscountRows(
  rows: Array<{
    id: string;
    status: string;
    totalFee: number;
    discountPercent: number;
    discountFixedAmount: number | null;
    finalFee: number;
    discountFeeHeadLabel: string | null;
    discountRemarks: string | null;
    reviewRemarks: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    studentName: string | null;
    admissionNumber: string;
    className: string | null;
    section: string | null;
    requestedByName: string | null;
    reviewedByName: string | null;
  }>
): SchoolFeesBackupDiscountRow[] {
  return rows.map((row) => ({
    ...row,
    source: "APPROVAL_REQUEST" as const,
    discountAmount: discountAmountFromRow(row),
    discountFeeHeadKey: null,
  }));
}

function buildAppliedOnRecordDiscountRows(
  fees: Array<{
    studentId: string;
    updatedAt: Date;
    totalFee: number;
    discountPercent: number;
    finalFee: number;
    discountFeeHeadKey: string | null;
    discountFeeHeadLabel: string | null;
    discountRemarks: string | null;
    student: {
      admissionNumber: string;
      user: { name: string | null } | null;
      class: { name: string | null; section: string | null } | null;
    };
  }>
): SchoolFeesBackupDiscountRow[] {
  const rows: SchoolFeesBackupDiscountRow[] = [];
  for (const f of fees) {
    const discountAmount = roundRupee(Math.max(0, f.totalFee - f.finalFee));
    if (discountAmount <= 0 && f.discountPercent <= 0) continue;
    const cls = f.student.class;
    rows.push({
      id: `applied-${f.studentId}`,
      source: "APPLIED_ON_RECORD",
      status: "APPLIED",
      totalFee: f.totalFee,
      discountPercent: f.discountPercent,
      discountAmount,
      discountFixedAmount: discountAmount > 0 ? discountAmount : null,
      finalFee: f.finalFee,
      discountFeeHeadKey: f.discountFeeHeadKey,
      discountFeeHeadLabel: f.discountFeeHeadLabel,
      discountRemarks: f.discountRemarks,
      reviewRemarks: null,
      reviewedAt: f.updatedAt,
      createdAt: f.updatedAt,
      studentName: f.student.user?.name ?? null,
      admissionNumber: f.student.admissionNumber,
      className: cls?.name ?? null,
      section: cls?.section ?? null,
      requestedByName: null,
      reviewedByName: null,
    });
  }
  return rows;
}

function mergeSchoolFeesBackupDiscounts(args: {
  approvalRows: SchoolFeesBackupDiscountRow[];
  appliedRows: SchoolFeesBackupDiscountRow[];
}): SchoolFeesBackupDiscountRow[] {
  const admissionsWithApprovals = new Set(args.approvalRows.map((r) => r.admissionNumber));
  const legacyOnly = args.appliedRows.filter((r) => !admissionsWithApprovals.has(r.admissionNumber));
  return [...args.approvalRows, ...legacyOnly].sort((a, b) => {
    const studentCmp = (a.studentName || a.admissionNumber).localeCompare(
      b.studentName || b.admissionNumber,
      "en",
      { sensitivity: "base" }
    );
    if (studentCmp !== 0) return studentCmp;
    const timeA = (a.reviewedAt ?? a.createdAt).getTime();
    const timeB = (b.reviewedAt ?? b.createdAt).getTime();
    return timeA - timeB;
  });
}

export type SchoolFeesBackupDiscountSource = "APPROVAL_REQUEST" | "APPLIED_ON_RECORD";

export type SchoolFeesBackupDiscountRow = {
  id: string;
  source: SchoolFeesBackupDiscountSource;
  status: string;
  totalFee: number;
  discountPercent: number;
  discountAmount: number;
  discountFixedAmount: number | null;
  finalFee: number;
  discountFeeHeadKey: string | null;
  discountFeeHeadLabel: string | null;
  discountRemarks: string | null;
  reviewRemarks: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  studentName: string | null;
  admissionNumber: string;
  className: string | null;
  section: string | null;
  requestedByName: string | null;
  reviewedByName: string | null;
};

export type SchoolFeesBackupRefundRow = {
  id: string;
  paymentId: string;
  amount: number;
  reason: string | null;
  status: string;
  createdAt: Date;
  studentName: string | null;
  admissionNumber: string | null;
  paymentAmount: number;
  paymentDate: Date;
};

export type SchoolFeesBackupStudentFeeRow = {
  studentId: string;
  studentName: string | null;
  admissionNumber: string | null;
  className: string | null;
  section: string | null;
  parent: string | null;
  mobile: string | null;
  category: string | null;
  totalFee: number;
  discountPercent: number;
  discountAmount: number;
  discountFeeHeadLabel: string | null;
  discountRemarks: string | null;
  discountApprovedBy: string | null;
  discountRequestedBy: string | null;
  finalFee: number;
  amountPaid: number;
  remainingFee: number;
};

export type SchoolFeesBackupData = {
  school: {
    id: string;
    name: string;
    address: string | null;
    location: string | null;
  };
  transactions: DayReportTx[];
  studentFees: SchoolFeesBackupStudentFeeRow[];
  discounts: SchoolFeesBackupDiscountRow[];
  refunds: SchoolFeesBackupRefundRow[];
  feeDuePayload: ReturnType<typeof buildFeeDueReportPayload>;
  generatedAt: string;
};

/** All successful fee payments + admission collections for a school (no date filter). */
export async function loadAllSchoolFeeBackupTransactions(schoolId: string): Promise<DayReportTx[]> {
  const paymentWhere = {
    student: { schoolId },
    ...FEE_COLLECTION_PAYMENT_WHERE,
  };

  const [payments, admissionTxs] = await Promise.all([
    prisma.payment.findMany({
      where: paymentWhere,
      select: {
        id: true,
        amount: true,
        gateway: true,
        transactionId: true,
        hyperpgTxnId: true,
        status: true,
        createdAt: true,
        collectedByName: true,
        collectedByUserId: true,
        collectedBy: { select: { name: true, email: true } },
        student: {
          select: {
            id: true,
            admissionNumber: true,
            user: { select: { name: true } },
            class: { select: { id: true, name: true, section: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    loadAdmissionFeeDayReportTransactions(
      schoolId,
      new Date(2000, 0, 1),
      new Date(2099, 11, 31, 23, 59, 59, 999)
    ),
  ]);

  const paymentIds = payments.map((p) => p.id);
  const paymentAllocations =
    paymentIds.length > 0
      ? await prisma.paymentFeeAllocation.findMany({
          where: {
            paymentId: { in: paymentIds },
            allocationType: "PAYMENT",
          },
          select: {
            paymentId: true,
            headType: true,
            componentIndex: true,
            componentName: true,
            extraFeeId: true,
            allocatedAmount: true,
          },
        })
      : [];

  const extraFeeIds = Array.from(
    new Set(
      paymentAllocations
        .filter((a) => a.headType === "EXTRA_FEE" && !!a.extraFeeId)
        .map((a) => a.extraFeeId as string)
    )
  );
  const extraFees =
    extraFeeIds.length > 0
      ? await prisma.extraFee.findMany({
          where: { id: { in: extraFeeIds } },
          select: { id: true, name: true },
        })
      : [];
  const extraFeeNameById = new Map(extraFees.map((ef) => [ef.id, ef.name]));

  const allocationLabelAmountByPayment = new Map<string, Map<string, number>>();
  for (const a of paymentAllocations) {
    if (a.allocatedAmount <= 0.00001) continue;
    let label = "Default";
    if (a.headType === "BASE_COMPONENT") {
      label =
        a.componentName ||
        (typeof a.componentIndex === "number" ? `Component ${a.componentIndex + 1}` : "School Fees");
    } else if (a.headType === "EXTRA_FEE") {
      label = a.extraFeeId ? (extraFeeNameById.get(a.extraFeeId) ?? "Extra Fee") : "Extra Fee";
    }
    const perPayment = allocationLabelAmountByPayment.get(a.paymentId) ?? new Map<string, number>();
    allocationLabelAmountByPayment.set(a.paymentId, perPayment);
    perPayment.set(label, (perPayment.get(label) ?? 0) + a.allocatedAmount);
  }

  const dominantFeeTypeByPayment = new Map<string, { name: string; amount: number }>();
  for (const [paymentId, labelMap] of allocationLabelAmountByPayment.entries()) {
    let bestName = "Default";
    let bestAmount = 0;
    for (const [name, amt] of labelMap.entries()) {
      if (amt > bestAmount) {
        bestAmount = amt;
        bestName = name;
      }
    }
    dominantFeeTypeByPayment.set(paymentId, { name: bestName, amount: bestAmount });
  }

  const collectorUserIds = Array.from(
    new Set(payments.map((p) => p.collectedByUserId).filter((id): id is string => Boolean(id)))
  );
  const collectorUsers =
    collectorUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: collectorUserIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const collectorLabelByUserId = new Map<string, string>();
  for (const user of collectorUsers) {
    const label = userCollectorDisplayLabel(user);
    if (label) collectorLabelByUserId.set(user.id, label);
  }

  const paymentTxs: DayReportTx[] = payments.map((p) => {
    const perHead = allocationLabelAmountByPayment.get(p.id);
    const feeAllocations = perHead
      ? Array.from(perHead.entries()).map(([name, amount]) => ({ name, amount }))
      : [];
    const dominant = dominantFeeTypeByPayment.get(p.id);
    return {
      id: p.id,
      amount: p.amount,
      gateway: p.gateway,
      createdAt: p.createdAt.toISOString(),
      transactionId: p.transactionId,
      hyperpgTxnId: p.hyperpgTxnId,
      collectedByName:
        resolvePaymentCollectorDisplayName(
          p.collectedByName,
          p.collectedBy,
          p.collectedByUserId,
          collectorLabelByUserId
        ) ?? p.collectedByName?.trim() ?? null,
      collectedByUserId: p.collectedByUserId ?? null,
      feeTypeName: dominant?.name ?? "Default",
      feeAllocations,
      student: p.student,
    };
  });

  return [...paymentTxs, ...admissionTxs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export async function loadSchoolFeesBackupData(schoolId: string): Promise<SchoolFeesBackupData | null> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, address: true, location: true },
  });
  if (!school) return null;

  const [transactions, fees, structuresRaw, extraFeesRaw, discountRows, refundRows] = await Promise.all([
    loadAllSchoolFeeBackupTransactions(schoolId),
    prisma.studentFee.findMany({
      where: { student: { schoolId } },
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
    prisma.$queryRaw<SchoolFeesBackupDiscountRow[]>`
      SELECT
        fda.id,
        fda.status::text AS status,
        fda."totalFee",
        fda."discountPercent",
        fda."discountFixedAmount",
        fda."finalFee",
        fda."discountFeeHeadLabel",
        fda."discountRemarks",
        fda."reviewRemarks",
        fda."reviewedAt",
        fda."createdAt",
        su.name AS "studentName",
        s."admissionNumber",
        c.name AS "className",
        c.section,
        ru.name AS "requestedByName",
        vu.name AS "reviewedByName"
      FROM "FeeDiscountApproval" fda
      JOIN "Student" s ON s.id = fda."studentId"
      LEFT JOIN "User" su ON su.id = s."userId"
      LEFT JOIN "Class" c ON c.id = s."classId"
      LEFT JOIN "User" ru ON ru.id = fda."requestedById"
      LEFT JOIN "User" vu ON vu.id = fda."reviewedById"
      WHERE fda."schoolId" = ${schoolId}
      ORDER BY fda."createdAt" ASC
    `,
    prisma.refund.findMany({
      where: {
        status: "SUCCESS",
        payment: { student: { schoolId } },
      },
      select: {
        id: true,
        paymentId: true,
        amount: true,
        reason: true,
        status: true,
        createdAt: true,
        payment: {
          select: {
            amount: true,
            createdAt: true,
            student: {
              select: {
                admissionNumber: true,
                user: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
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
  const classMetaById = new Map<string, { id: string; name: string; section: string | null }>();
  for (const s of structuresRaw) {
    classMetaById.set(s.classId, {
      id: s.classId,
      name: s.class?.name ?? "",
      section: s.class?.section ?? null,
    });
  }
  for (const f of fees) {
    const cls = f.student.class;
    if (cls?.id) {
      classMetaById.set(cls.id, { id: cls.id, name: cls.name, section: cls.section });
    }
  }
  fillMissingClassFeeStructuresFromSiblings(componentsByClassId, [...classMetaById.values()]);

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
      discountFeeHeadKey: f.discountFeeHeadKey,
      discountFeeHeadLabel: f.discountFeeHeadLabel,
      name: st.user?.name ?? null,
      admissionNo: st.admissionNumber,
      parent: st.fatherName?.trim() || "-",
      mobile: st.phoneNo?.trim() || "-",
      category: st.residencyType,
    };
  });

  const feeDuePayload = buildFeeDueReportPayload({
    schoolName: school.name,
    extraFees,
    students,
    netPaidByStudentHead,
    componentsByClassId,
    includeSchoolWideExtras: true,
    extraFeesById: new Map(extraFees.map((e) => [e.id, { id: e.id, name: e.name }])),
  });

  const studentFees: SchoolFeesBackupStudentFeeRow[] = fees.map((f) => {
    const st = f.student;
    const cls = st.class;
    const admissionNumber = st.admissionNumber;
    const studentDiscounts = discountRows.filter((d) => d.admissionNumber === admissionNumber);
    const latestApproved = [...studentDiscounts]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .find((d) => d.status === "APPROVED");
    const latestAny = [...studentDiscounts].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    )[0];
    const discountMeta = latestApproved ?? latestAny;
    return {
      studentId: st.id,
      studentName: st.user?.name ?? null,
      admissionNumber,
      className: cls?.name ?? null,
      section: cls?.section ?? null,
      parent: st.fatherName?.trim() || null,
      mobile: st.phoneNo?.trim() || null,
      category: st.residencyType,
      totalFee: f.totalFee,
      discountPercent: f.discountPercent,
      discountAmount: roundRupee(Math.max(0, f.totalFee - f.finalFee)),
      discountFeeHeadLabel: f.discountFeeHeadLabel,
      discountRemarks: f.discountRemarks,
      discountApprovedBy: latestApproved?.reviewedByName ?? null,
      discountRequestedBy: discountMeta?.requestedByName ?? null,
      finalFee: f.finalFee,
      amountPaid: f.amountPaid,
      remainingFee: f.remainingFee,
    };
  });

  const refunds: SchoolFeesBackupRefundRow[] = refundRows.map((r) => ({
    id: r.id,
    paymentId: r.paymentId,
    amount: r.amount,
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt,
    studentName: r.payment.student.user?.name ?? null,
    admissionNumber: r.payment.student.admissionNumber,
    paymentAmount: r.payment.amount,
    paymentDate: r.payment.createdAt,
  }));

  const discounts = mergeSchoolFeesBackupDiscounts({
    approvalRows: mapApprovalDiscountRows(discountRows),
    appliedRows: buildAppliedOnRecordDiscountRows(fees),
  });

  return {
    school,
    transactions,
    studentFees,
    discounts,
    refunds,
    feeDuePayload,
    generatedAt: new Date().toISOString(),
  };
}
