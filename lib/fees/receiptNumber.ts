/**
 * Stable per-school receipt numbers (1, 2, 3...). Before this, the "Receipt no" in day reports was only
 * the row position in that one report, so a number a parent quoted could not be matched to a payment.
 *
 * A number is assigned once, when a fee payment succeeds, inside the same transaction as the payment.
 * The counter is a single row per school updated with INSERT ... ON CONFLICT DO UPDATE, so two payments
 * recorded at the same moment can never get the same number. Numbers are never reused: a deleted
 * payment leaves a gap (its number stays in the payment history). A rolled-back transaction rolls the
 * counter back with it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- structural type so both the plain and the extended Prisma clients fit */
export type ReceiptDb = {
  $queryRaw: (query: TemplateStringsArray, ...values: any[]) => PromiseLike<any>;
  payment: {
    findUnique: (args: any) => PromiseLike<any>;
    updateMany: (args: any) => PromiseLike<{ count: number }>;
  };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export function formatReceiptNo(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? `R-${String(Math.trunc(n)).padStart(6, "0")}` : "-";
}

/** Accepts "R-000123", "r123" or "123". Returns null for anything else. */
export function parseReceiptNo(raw: string): number | null {
  const m = /^\s*r?-?\s*0*(\d{1,9})\s*$/i.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

async function nextReceiptNo(db: ReceiptDb, schoolId: string): Promise<number> {
  const rows = (await db.$queryRaw`
    INSERT INTO "ReceiptCounter" ("schoolId", "lastNo") VALUES (${schoolId}, 1)
    ON CONFLICT ("schoolId") DO UPDATE SET "lastNo" = "ReceiptCounter"."lastNo" + 1
    RETURNING "lastNo"`) as Array<{ lastNo: number }>;
  const n = Number(rows[0]?.lastNo);
  if (!Number.isInteger(n) || n < 1) throw new Error("Could not allocate a receipt number");
  return n;
}

/**
 * Give a successful fee payment its receipt number if it has none. Safe to call repeatedly and on
 * payments that are not fee payments (event registrations are skipped). Returns the payment's number,
 * or null when it does not get one.
 */
export async function ensureReceiptNo(
  db: ReceiptDb,
  schoolId: string,
  paymentId: string
): Promise<number | null> {
  const p = await db.payment.findUnique({
    where: { id: paymentId },
    select: { receiptNo: true, status: true, purpose: true, eventRegistrationId: true },
  });
  if (!p) return null;
  if (p.receiptNo != null) return p.receiptNo;
  if (p.status !== "SUCCESS" || p.purpose !== "FEES" || p.eventRegistrationId) return null;

  const n = await nextReceiptNo(db, schoolId);
  const set = await db.payment.updateMany({ where: { id: paymentId, receiptNo: null }, data: { receiptNo: n } });
  if (set.count === 1) return n;
  // Another request numbered it first; ours is skipped (a gap, never a duplicate).
  const again = await db.payment.findUnique({ where: { id: paymentId }, select: { receiptNo: true } });
  return again?.receiptNo ?? null;
}
