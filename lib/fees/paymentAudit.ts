import type { Prisma } from "@prisma/client";

/**
 * Append-only payment history (who created, changed, deleted or refunded a payment).
 * Writes go through the same transaction as the change, so a financial change can never
 * commit without its audit row. See docs/PAYMENT_AUDIT.md.
 */
export type PaymentAuditAction = "CREATE" | "UPDATE" | "DELETE" | "REFUND" | "STATUS" | "ALERT";

export type PaymentAuditActor = {
  userId?: string | null;
  name?: string | null;
  role?: string | null;
};

export type PaymentAuditPayment = {
  id: string;
  studentId: string;
  amount: number;
  status?: string | null;
  gateway?: string | null;
  transactionId?: string | null;
  createdAt?: Date | string | null;
  purpose?: string | null;
  collectedByName?: string | null;
};

export type PaymentAuditAllocation = {
  headType?: string | null;
  componentName?: string | null;
  componentIndex?: number | null;
  extraFeeId?: string | null;
  allocationType?: string | null;
  allocatedAmount: number;
};

/** The slice of a Prisma client / transaction client this module needs. */
export type PaymentAuditWriter = {
  paymentAuditLog: {
    create: (args: { data: Prisma.PaymentAuditLogUncheckedCreateInput }) => Promise<unknown>;
  };
};

const MAX_SNAPSHOT_ALLOCATIONS = 50;
const MAX_SUMMARY_LENGTH = 500;

/** Who is acting, from a NextAuth session. Name falls back to the email, then null. */
export function auditActorFromSession(
  session:
    | { user?: { id?: string | null; name?: string | null; email?: string | null; role?: string | null } }
    | null
    | undefined
): PaymentAuditActor {
  const u = session?.user;
  return {
    userId: u?.id ?? null,
    name: u?.name?.trim() || u?.email?.trim() || null,
    role: u?.role ?? null,
  };
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

/**
 * Stable, minimal picture of a payment. Ids, amounts and references only: no student name,
 * phone or other personal data, so the log can outlive a student's de-identification.
 */
export function paymentAuditSnapshot(
  p: PaymentAuditPayment,
  allocations?: PaymentAuditAllocation[]
): Prisma.InputJsonObject {
  const out: Record<string, Prisma.InputJsonValue | null> = {
    id: p.id,
    studentId: p.studentId,
    amount: p.amount,
    status: p.status ?? null,
    gateway: p.gateway ?? null,
    transactionId: p.transactionId ?? null,
    createdAt: iso(p.createdAt),
    collectedByName: p.collectedByName ?? null,
  };
  if (allocations) {
    out.allocations = allocations.slice(0, MAX_SNAPSHOT_ALLOCATIONS).map((a) => ({
      headType: a.headType ?? null,
      name: a.componentName ?? null,
      componentIndex: a.componentIndex ?? null,
      extraFeeId: a.extraFeeId ?? null,
      type: a.allocationType ?? null,
      amount: a.allocatedAmount,
    }));
    out.allocationCount = allocations.length;
  }
  return out as Prisma.InputJsonObject;
}

/** "Amount 5000 -> 4500; Reference A -> B" for whichever of the editable fields changed. */
export function describePaymentChange(
  before: Pick<PaymentAuditPayment, "amount" | "transactionId" | "gateway" | "createdAt">,
  after: Pick<PaymentAuditPayment, "amount" | "transactionId" | "gateway" | "createdAt">
): string | null {
  const parts: string[] = [];
  if (Math.abs(before.amount - after.amount) > 0.004) {
    parts.push(`Amount ${before.amount} -> ${after.amount}`);
  }
  if ((before.transactionId ?? null) !== (after.transactionId ?? null)) {
    parts.push(`Reference ${before.transactionId ?? "none"} -> ${after.transactionId ?? "none"}`);
  }
  if ((before.gateway ?? null) !== (after.gateway ?? null)) {
    parts.push(`Mode ${before.gateway ?? "none"} -> ${after.gateway ?? "none"}`);
  }
  if (iso(before.createdAt) !== iso(after.createdAt)) {
    parts.push(
      `Date ${iso(before.createdAt)?.slice(0, 10) ?? "none"} -> ${iso(after.createdAt)?.slice(0, 10) ?? "none"}`
    );
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

export type PaymentAuditEntry = {
  schoolId: string;
  paymentId: string;
  studentId: string;
  action: PaymentAuditAction;
  actor?: PaymentAuditActor | null;
  summary?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
};

/**
 * Write one audit row. Pass the transaction client so it commits or rolls back with the change.
 * Throws on failure on purpose: an unaudited financial change must not go through.
 */
export async function recordPaymentAudit(db: PaymentAuditWriter, entry: PaymentAuditEntry): Promise<void> {
  const summary = entry.summary ? entry.summary.slice(0, MAX_SUMMARY_LENGTH) : null;
  await db.paymentAuditLog.create({
    data: {
      schoolId: entry.schoolId,
      paymentId: entry.paymentId,
      studentId: entry.studentId,
      action: entry.action,
      actorUserId: entry.actor?.userId ?? null,
      actorName: entry.actor?.name ?? null,
      actorRole: entry.actor?.role ?? null,
      summary,
      ...(entry.before != null ? { before: entry.before } : {}),
      ...(entry.after != null ? { after: entry.after } : {}),
    },
  });
}
