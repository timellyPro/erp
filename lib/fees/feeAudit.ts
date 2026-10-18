import type { Prisma } from "@prisma/client";

/**
 * Append-only history of fee-setup changes (extra fees created, edited, deleted). Written in the same
 * transaction as the change, so a fee change never commits unaudited. Payments have their own log
 * (lib/fees/paymentAudit.ts). Ids, names and amounts only: no student personal data.
 */
export type FeeAuditAction = "CREATE" | "UPDATE" | "DELETE";

export type FeeAuditWriter = {
  feeAuditLog: {
    create: (args: { data: Prisma.FeeAuditLogUncheckedCreateInput }) => Promise<unknown>;
  };
};

export type ExtraFeeAuditFields = {
  id: string;
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope: string;
};

const MAX_SUMMARY_LENGTH = 500;

export function extraFeeAuditSnapshot(fee: ExtraFeeAuditFields): Prisma.InputJsonObject {
  return {
    id: fee.id,
    name: fee.name,
    amount: fee.amount,
    targetType: fee.targetType,
    targetClassId: fee.targetClassId,
    targetSection: fee.targetSection,
    targetStudentId: fee.targetStudentId,
    residencyScope: fee.residencyScope,
  };
}

/** `Name "A" -> "B"; Amount 500 -> 700`, or null when neither changed. */
export function describeExtraFeeChange(
  before: { name: string; amount: number },
  after: { name: string; amount: number }
): string | null {
  const parts: string[] = [];
  if (before.name.trim() !== after.name.trim()) parts.push(`Name "${before.name}" -> "${after.name}"`);
  if (Math.abs(before.amount - after.amount) > 0.004) parts.push(`Amount ${before.amount} -> ${after.amount}`);
  return parts.length > 0 ? parts.join("; ") : null;
}

export async function recordFeeAudit(
  db: FeeAuditWriter,
  entry: {
    schoolId: string;
    entityType: "EXTRA_FEE";
    entityId: string;
    action: FeeAuditAction;
    actor?: { userId?: string | null; name?: string | null; role?: string | null } | null;
    summary?: string | null;
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
  }
): Promise<void> {
  await db.feeAuditLog.create({
    data: {
      schoolId: entry.schoolId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actorUserId: entry.actor?.userId ?? null,
      actorName: entry.actor?.name ?? null,
      actorRole: entry.actor?.role ?? null,
      summary: entry.summary ? entry.summary.slice(0, MAX_SUMMARY_LENGTH) : null,
      ...(entry.before != null ? { before: entry.before } : {}),
      ...(entry.after != null ? { after: entry.after } : {}),
    },
  });
}
