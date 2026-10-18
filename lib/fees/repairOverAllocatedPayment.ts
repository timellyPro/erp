import { paymentAuditSnapshot, recordPaymentAudit, type PaymentAuditActor, type PaymentAuditWriter } from "@/lib/fees/paymentAudit";

/**
 * Removes ONE fee-head allocation that has no money behind it.
 *
 * A payment's allocations must add up to the payment amount. When they add up to more (for example
 * a 14,000 payment carrying 26,550 of allocations), the per-head screens and reports show some head
 * as paid that was never paid. The payment itself and the student's total paid are correct; only
 * the split by head is wrong, so the repair deletes the surplus allocation and leaves the payment,
 * the student's totals and every other allocation untouched.
 *
 * Safe by construction:
 *  - dry run unless `apply` is true;
 *  - refuses unless the payment really IS over-allocated, and unless removing this allocation does not
 *    leave it under-allocated (it will not delete a real allocation);
 *  - one transaction, with an audit row (who, why, before/after) written with the delete.
 */
type AllocationRow = {
  id: string;
  paymentId: string;
  studentId: string;
  headType: string;
  componentName: string | null;
  componentIndex: number | null;
  extraFeeId: string | null;
  allocationType: string;
  allocatedAmount: number;
  createdAt: Date;
};

type PaymentRow = {
  id: string;
  studentId: string;
  amount: number;
  status: string;
  gateway: string | null;
  transactionId: string | null;
  createdAt: Date;
  collectedByName: string | null;
  student: { schoolId: string };
};

export type RepairDb = {
  paymentFeeAllocation: {
    findUnique: (args: { where: { id: string } }) => Promise<AllocationRow | null>;
    findMany: (args: { where: { paymentId: string } }) => Promise<AllocationRow[]>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
  payment: {
    findUnique: (args: { where: { id: string }; select: Record<string, unknown> }) => Promise<PaymentRow | null>;
  };
  $transaction: <T>(fn: (tx: RepairDb & PaymentAuditWriter) => Promise<T>) => Promise<T>;
};

export type OverAllocationPlan = {
  ok: boolean;
  reason?: string;
  paymentId: string;
  paymentAmount: number;
  netAllocatedBefore: number;
  netAllocatedAfter: number;
  surplus: number;
  allocation?: { id: string; head: string; amount: number; createdAt: string };
};

const EPS = 0.01;

function netAllocated(rows: AllocationRow[]): number {
  return Math.round(
    rows.reduce((sum, r) => sum + (r.allocationType === "REFUND" ? -1 : 1) * r.allocatedAmount, 0) * 100
  ) / 100;
}

export async function planOverAllocationRepair(
  db: RepairDb,
  input: { schoolId: string; allocationId: string }
): Promise<{ plan: OverAllocationPlan; payment: PaymentRow | null; rows: AllocationRow[] }> {
  const empty = (reason: string, paymentId = ""): { plan: OverAllocationPlan; payment: null; rows: [] } => ({
    plan: { ok: false, reason, paymentId, paymentAmount: 0, netAllocatedBefore: 0, netAllocatedAfter: 0, surplus: 0 },
    payment: null,
    rows: [],
  });

  const allocation = await db.paymentFeeAllocation.findUnique({ where: { id: input.allocationId } });
  if (!allocation) return empty("Allocation not found");

  const payment = await db.payment.findUnique({
    where: { id: allocation.paymentId },
    select: {
      id: true,
      studentId: true,
      amount: true,
      status: true,
      gateway: true,
      transactionId: true,
      createdAt: true,
      collectedByName: true,
      student: { select: { schoolId: true } },
    },
  });
  if (!payment || payment.student.schoolId !== input.schoolId) {
    return empty("Allocation does not belong to a payment in this school", allocation.paymentId);
  }

  const rows = await db.paymentFeeAllocation.findMany({ where: { paymentId: payment.id } });
  const before = netAllocated(rows);
  const after = netAllocated(rows.filter((r) => r.id !== allocation.id));
  const surplus = Math.round((before - payment.amount) * 100) / 100;

  const plan: OverAllocationPlan = {
    ok: false,
    paymentId: payment.id,
    paymentAmount: payment.amount,
    netAllocatedBefore: before,
    netAllocatedAfter: after,
    surplus,
    allocation: {
      id: allocation.id,
      head: allocation.componentName ?? allocation.extraFeeId ?? allocation.headType,
      amount: allocation.allocatedAmount,
      createdAt: allocation.createdAt.toISOString(),
    },
  };

  if (allocation.allocationType !== "PAYMENT") {
    return { plan: { ...plan, reason: "Only a PAYMENT allocation can be removed here, not a REFUND" }, payment, rows };
  }
  if (surplus <= EPS) {
    return { plan: { ...plan, reason: "This payment is not over-allocated; nothing to repair" }, payment, rows };
  }
  if (after < payment.amount - EPS) {
    return {
      plan: {
        ...plan,
        reason: "Removing this allocation would leave the payment under-allocated; it is not the surplus row",
      },
      payment,
      rows,
    };
  }
  return { plan: { ...plan, ok: true }, payment, rows };
}

export async function repairOverAllocatedPayment(
  db: RepairDb,
  input: { schoolId: string; allocationId: string; reason: string; actor: PaymentAuditActor; apply: boolean }
): Promise<OverAllocationPlan & { applied: boolean }> {
  if (!input.reason.trim()) {
    throw new Error("A reason is required (it is written to the payment's history)");
  }
  const { plan, payment, rows } = await planOverAllocationRepair(db, input);
  if (!plan.ok || !payment || !input.apply) return { ...plan, applied: false };

  const removed = rows.find((r) => r.id === input.allocationId)!;
  await db.$transaction(async (tx) => {
    await recordPaymentAudit(tx, {
      schoolId: input.schoolId,
      paymentId: payment.id,
      studentId: payment.studentId,
      action: "UPDATE",
      actor: input.actor,
      summary: `Removed an allocation of ${removed.allocatedAmount} (${plan.allocation!.head}) that had no payment behind it; allocations were ${plan.netAllocatedBefore} against a payment of ${payment.amount}. Reason: ${input.reason.trim()}`,
      before: paymentAuditSnapshot(payment, rows),
      after: paymentAuditSnapshot(
        payment,
        rows.filter((r) => r.id !== removed.id)
      ),
    });
    await tx.paymentFeeAllocation.delete({ where: { id: removed.id } });
  });
  return { ...plan, applied: true };
}
