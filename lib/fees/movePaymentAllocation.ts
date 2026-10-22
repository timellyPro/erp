import { paymentAuditSnapshot, recordPaymentAudit, type PaymentAuditActor, type PaymentAuditWriter } from "@/lib/fees/paymentAudit";

/**
 * Moves part or all of ONE payment allocation from the fee head it was recorded against to other heads
 * (for example hostel money paid by a student who is a day scholar, which the school confirms should count
 * toward mess). The payment, its amount and the student's total paid never change; only the split by head.
 *
 * Safe by construction:
 *  - dry run unless `apply` is true;
 *  - only a PAYMENT allocation (never a REFUND);
 *  - the new allocations must add up to exactly the allocation they replace, so the payment stays fully
 *    and exactly allocated;
 *  - every extra-fee target must exist in this school;
 *  - one transaction: the audit row (who, why, before/after) commits with the change or not at all.
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

export type MoveTarget =
  | { headType: "EXTRA_FEE"; extraFeeId: string; amount: number }
  | { headType: "BASE_COMPONENT"; componentIndex: number; componentName: string; amount: number };

export type MoveDb = {
  paymentFeeAllocation: {
    findUnique: (args: { where: { id: string } }) => Promise<AllocationRow | null>;
    findMany: (args: { where: { paymentId: string } }) => Promise<AllocationRow[]>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
    create: (args: { data: Omit<AllocationRow, "id"> }) => Promise<unknown>;
  };
  payment: {
    findUnique: (args: { where: { id: string }; select: Record<string, unknown> }) => Promise<PaymentRow | null>;
  };
  extraFee: {
    findFirst: (args: { where: { id: string; schoolId: string }; select: { id: true; name: true } }) => Promise<{ id: string; name: string } | null>;
  };
  $transaction: <T>(fn: (tx: MoveDb & PaymentAuditWriter) => Promise<T>) => Promise<T>;
};

export type MovePlan = {
  ok: boolean;
  reason?: string;
  paymentId: string;
  from?: { id: string; head: string; amount: number };
  to: Array<{ head: string; amount: number }>;
};

const EPS = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function planAllocationMove(
  db: MoveDb,
  input: { schoolId: string; allocationId: string; targets: MoveTarget[] }
): Promise<{ plan: MovePlan; payment: PaymentRow | null; rows: AllocationRow[]; names: Map<string, string> }> {
  const names = new Map<string, string>();
  const fail = (reason: string, paymentId = ""): { plan: MovePlan; payment: null; rows: []; names: Map<string, string> } => ({
    plan: { ok: false, reason, paymentId, to: [] },
    payment: null,
    rows: [],
    names,
  });

  const allocation = await db.paymentFeeAllocation.findUnique({ where: { id: input.allocationId } });
  if (!allocation) return fail("Allocation not found");
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
    return fail("Allocation does not belong to a payment in this school", allocation.paymentId);
  }
  const rows = await db.paymentFeeAllocation.findMany({ where: { paymentId: payment.id } });

  const base: MovePlan = {
    ok: false,
    paymentId: payment.id,
    from: { id: allocation.id, head: allocation.componentName ?? allocation.extraFeeId ?? allocation.headType, amount: allocation.allocatedAmount },
    to: [],
  };
  const stop = (reason: string) => ({ plan: { ...base, reason }, payment, rows, names });

  if (allocation.allocationType !== "PAYMENT") return stop("Only a PAYMENT allocation can be moved, not a REFUND");
  if (input.targets.length === 0) return stop("Give at least one target head");

  let sum = 0;
  for (const t of input.targets) {
    if (!Number.isFinite(t.amount) || t.amount <= 0) return stop("Every target amount must be more than zero");
    sum = round2(sum + t.amount);
    if (t.headType === "EXTRA_FEE") {
      const fee = await db.extraFee.findFirst({ where: { id: t.extraFeeId, schoolId: input.schoolId }, select: { id: true, name: true } });
      if (!fee) return stop(`Extra fee ${t.extraFeeId} does not exist in this school`);
      names.set(t.extraFeeId, fee.name);
      base.to.push({ head: fee.name, amount: t.amount });
    } else {
      if (!Number.isInteger(t.componentIndex) || t.componentIndex < 0) return stop("componentIndex must be a whole number, zero or more");
      base.to.push({ head: `${t.componentName} (component ${t.componentIndex})`, amount: t.amount });
    }
  }
  if (Math.abs(sum - allocation.allocatedAmount) > EPS) {
    return stop(`The targets add up to ${sum} but the allocation is ${allocation.allocatedAmount}; they must be equal`);
  }
  return { plan: { ...base, ok: true }, payment, rows, names };
}

export async function movePaymentAllocation(
  db: MoveDb,
  input: { schoolId: string; allocationId: string; targets: MoveTarget[]; reason: string; actor: PaymentAuditActor; apply: boolean }
): Promise<MovePlan & { applied: boolean }> {
  if (!input.reason.trim()) throw new Error("A reason is required (it is written to the payment's history)");
  const { plan, payment, rows, names } = await planAllocationMove(db, input);
  if (!plan.ok || !payment || !input.apply) return { ...plan, applied: false };

  const old = rows.find((r) => r.id === input.allocationId)!;
  const created = input.targets.map((t) => ({
    paymentId: old.paymentId,
    studentId: old.studentId,
    headType: t.headType,
    componentIndex: t.headType === "BASE_COMPONENT" ? t.componentIndex : null,
    componentName: t.headType === "BASE_COMPONENT" ? t.componentName : (names.get(t.extraFeeId) ?? null),
    extraFeeId: t.headType === "EXTRA_FEE" ? t.extraFeeId : null,
    allocationType: "PAYMENT",
    allocatedAmount: t.amount,
    createdAt: old.createdAt,
  }));

  await db.$transaction(async (tx) => {
    await recordPaymentAudit(tx, {
      schoolId: input.schoolId,
      paymentId: payment.id,
      studentId: payment.studentId,
      action: "UPDATE",
      actor: input.actor,
      summary: `Moved ${old.allocatedAmount} from ${plan.from!.head} to ${plan.to.map((t) => `${t.head} ${t.amount}`).join(", ")}. Reason: ${input.reason.trim()}`,
      before: paymentAuditSnapshot(payment, rows),
      after: paymentAuditSnapshot(payment, [...rows.filter((r) => r.id !== old.id), ...created.map((c) => ({ ...c, id: "new" }))]),
    });
    await tx.paymentFeeAllocation.delete({ where: { id: old.id } });
    for (const data of created) await tx.paymentFeeAllocation.create({ data });
  });
  return { ...plan, applied: true };
}
