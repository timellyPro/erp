/**
 * Payment.status values that count toward fee head allocations (paid-by-head).
 * Keep in sync with reversal logic (e.g. DELETE /api/fees/payment/[id]).
 */
export const FEE_ALLOCATION_PAYMENT_STATUSES = ["SUCCESS", "COMPLETED"] as const;
