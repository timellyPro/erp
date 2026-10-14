-- Per-submit-attempt idempotency key for Payment, distinct from transactionId
-- (the business reference/UTR). Lets the offline/manual fee-entry form collapse
-- a double-click or a retried request into one Payment even when there is no
-- UTR at all (cash entries).
ALTER TABLE "Payment" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "Payment_clientRequestId_key" ON "Payment"("clientRequestId");
