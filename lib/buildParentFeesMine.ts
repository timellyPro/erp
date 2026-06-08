import prisma from "@/lib/db";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { redistributeBaseMinusOneAllocations } from "@/lib/redistributeBaseMinusOneAllocations";
import { structureMultiplierAfterDiscount } from "@/lib/studentTuitionFromStructure";
import { extraFeeAppliesToStudent } from "@/lib/extraFeeResidencyScope";
import { isStudentRte, isTuitionNamedExtraFee } from "@/lib/studentRte";
import {
  getParentPortalServerCached,
  setParentPortalServerCached,
} from "@/lib/parentPortalServerCache";

export type ParentFeesDueHead = {
  key: string;
  headType: "BASE_COMPONENT" | "EXTRA_FEE";
  label: string;
  snapshotAmount: number;
  paidBefore: number;
  dueBefore: number;
};

export type ParentFeesPayment = {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  transactionId: string | null;
  gateway: string;
  allocations: Array<{ label: string; amount: number }>;
};

export type ParentFeesPayload = {
  id: string;
  totalFee: number;
  discountPercent: number;
  finalFee: number;
  amountPaid: number;
  remainingFee: number;
  dueHeads: ParentFeesDueHead[];
  payments: ParentFeesPayment[];
  refunds: Array<{
    id: string;
    paymentId: string;
    amount: number;
    status: string;
    createdAt: string;
  }>;
  studentDisplay: { name: string; class: string };
};

export async function buildParentFeesMine(studentId: string): Promise<ParentFeesPayload | null> {
  const cacheKey = `parent:${studentId}:fees:mine`;
  const cached = getParentPortalServerCached<ParentFeesPayload>(cacheKey);
  if (cached) return cached;

  const fee = await prisma.studentFee.findUnique({
    where: { studentId },
    select: {
      id: true,
      totalFee: true,
      discountPercent: true,
      finalFee: true,
      amountPaid: true,
      remainingFee: true,
      student: {
        select: {
          classId: true,
          schoolId: true,
          residencyType: true,
          class: { select: { name: true, section: true } },
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!fee) return null;

  const classId = fee.student.classId;
  const residency = fee.student.residencyType ?? "Day Scholar";
  const rte = isStudentRte(residency);
  const structMult = structureMultiplierAfterDiscount(fee.discountPercent);

  const [components, extraFeesRaw, payments, paymentAllocations, refundAllocations] =
    await Promise.all([
      classId
        ? prisma.classFeeStructure.findUnique({
            where: { classId },
            select: { components: true },
          })
        : Promise.resolve(null),
      prisma.extraFee.findMany({
        where: {
          schoolId: fee.student.schoolId,
          OR: [
            { targetType: "SCHOOL" },
            { targetType: "STUDENT", targetStudentId: studentId },
            ...(classId ? [{ targetType: "CLASS" as const, targetClassId: classId }] : []),
            ...(classId && fee.student.class?.section
              ? [
                  {
                    targetType: "SECTION" as const,
                    targetClassId: classId,
                    targetSection: fee.student.class.section,
                  },
                ]
              : []),
          ],
        },
        select: { id: true, name: true, amount: true, residencyScope: true },
      }),
      prisma.payment.findMany({
        where: { studentId, eventRegistrationId: null, purpose: "FEES" },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          transactionId: true,
          gateway: true,
        },
      }),
      prisma.paymentFeeAllocation.findMany({
        where: {
          studentId,
          allocationType: "PAYMENT",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        select: {
          paymentId: true,
          headType: true,
          componentName: true,
          componentIndex: true,
          extraFeeId: true,
          allocatedAmount: true,
        },
      }),
      prisma.paymentFeeAllocation.findMany({
        where: {
          studentId,
          allocationType: "REFUND",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        select: { headType: true, componentIndex: true, extraFeeId: true, allocatedAmount: true },
      }),
    ]);

  const extraFees = extraFeesRaw
    .filter((ef) => extraFeeAppliesToStudent({ name: ef.name, residencyScope: ef.residencyScope }, residency))
    .filter((ef) => !(rte && isTuitionNamedExtraFee(ef.name)));

  const baseComponents =
    ((components?.components as Array<{ name: string; amount: number }>) || []).map((c) => ({
      name: String(c.name),
      amount: Number(c.amount) || 0,
    }));

  const heads = [
    ...baseComponents.map((c, idx) => ({
      key: `BASE:${idx}`,
      headType: "BASE_COMPONENT" as const,
      label: c.name,
      snapshotDue: rte ? 0 : c.amount * structMult,
    })),
    ...extraFees.map((ef) => ({
      key: `EXTRA:${ef.id}`,
      headType: "EXTRA_FEE" as const,
      label: ef.name,
      snapshotDue: Number(ef.amount) || 0,
    })),
  ];

  const netPaidByHead = new Map<string, number>();
  for (const a of paymentAllocations) {
    const key =
      a.headType === "BASE_COMPONENT" ? `BASE:${a.componentIndex}` : `EXTRA:${a.extraFeeId}`;
    netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) + a.allocatedAmount);
  }
  for (const a of refundAllocations) {
    const key =
      a.headType === "BASE_COMPONENT" ? `BASE:${a.componentIndex}` : `EXTRA:${a.extraFeeId}`;
    netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) - a.allocatedAmount);
  }

  redistributeBaseMinusOneAllocations(
    netPaidByHead,
    heads.map((h) => ({ key: h.key, snapshotDue: h.snapshotDue }))
  );

  const allocationsNetTotal = Array.from(netPaidByHead.values()).reduce((s, v) => s + v, 0);
  const legacyPaidTotal = Math.max(fee.amountPaid - allocationsNetTotal, 0);
  const totalSnapshotDue = Math.max(heads.reduce((s, h) => s + h.snapshotDue, 0), 0);

  const dueHeads: ParentFeesDueHead[] = heads.map((h) => {
    const paidAlloc = netPaidByHead.get(h.key) ?? 0;
    const paidLegacy = totalSnapshotDue > 0 ? legacyPaidTotal * (h.snapshotDue / totalSnapshotDue) : 0;
    const paidBefore = Math.max(paidAlloc + paidLegacy, 0);
    const dueBefore = Math.max(h.snapshotDue - paidBefore, 0);
    return {
      key: h.key,
      headType: h.headType,
      label: h.label,
      snapshotAmount: h.snapshotDue,
      paidBefore,
      dueBefore,
    };
  });

  const extraNameById = new Map(extraFees.map((ef) => [ef.id, ef.name]));
  const baseNameByIndex = new Map(baseComponents.map((c, i) => [i, c.name]));
  const paymentIds = payments.map((p) => p.id);

  type RefundRow = {
    id: string;
    paymentId: string;
    amount: number;
    status: string;
    createdAt: Date | string;
  };

  let refunds: ParentFeesPayload["refunds"] = [];
  if (paymentIds.length > 0) {
    const placeholders = paymentIds.map((_, i) => `$${i + 1}`).join(", ");
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT id, "paymentId", amount, status, "createdAt" FROM "Refund" WHERE "paymentId" IN (${placeholders}) AND status = 'SUCCESS' ORDER BY "createdAt" DESC`,
      ...paymentIds
    )) as RefundRow[];
    refunds = rows.map((r) => ({
      id: r.id,
      paymentId: r.paymentId,
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
  }

  const allocationsByPayment = new Map<string, Array<{ label: string; amount: number }>>();
  for (const row of paymentAllocations) {
    if (!paymentIds.includes(row.paymentId)) continue;
    const label =
      row.headType === "BASE_COMPONENT"
        ? row.componentName || baseNameByIndex.get(row.componentIndex ?? -1) || "Fee head"
        : extraNameById.get(row.extraFeeId ?? "") || "Extra fee";
    const list = allocationsByPayment.get(row.paymentId) ?? [];
    list.push({ label, amount: row.allocatedAmount });
    allocationsByPayment.set(row.paymentId, list);
  }

  const payload: ParentFeesPayload = {
    id: fee.id,
    totalFee: fee.totalFee,
    discountPercent: fee.discountPercent,
    finalFee: fee.finalFee,
    amountPaid: fee.amountPaid,
    remainingFee: fee.remainingFee,
    dueHeads,
    payments: payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      transactionId: p.transactionId,
      gateway: p.gateway,
      allocations: allocationsByPayment.get(p.id) ?? [],
    })),
    refunds,
    studentDisplay: {
      name: fee.student.user?.name || "Student",
      class: fee.student.class
        ? `${fee.student.class.name}${fee.student.class.section ? `-${fee.student.class.section}` : ""}`
        : "N/A",
    },
  };

  setParentPortalServerCached(cacheKey, payload, 120_000);
  return payload;
}
