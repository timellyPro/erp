-- Backstop against the /api/payment/verify race: a HyperPG order_id (stored on
-- transactionId) is generated fresh per payment attempt by create-order, so it
-- should never legitimately be reused across two Payment rows. Two concurrent
-- verify calls for the same order_id, when neither had a pre-created Payment
-- row to update, could otherwise both insert a Payment and both credit the
-- student's fee balance. This index makes the second insert fail with a
-- unique-violation instead, which the route now catches and treats as the
-- other request having already recorded the payment.
--
-- Scoped to gateway = 'HYPERPG' only: offline/manual payments' transactionId
-- is a user-entered UTR/reference and is intentionally NOT constrained here
-- (they're deduplicated separately by clientRequestId / same-ref append logic).
CREATE UNIQUE INDEX "Payment_hyperpg_transactionId_key"
  ON "Payment"("transactionId")
  WHERE "gateway" = 'HYPERPG' AND "transactionId" IS NOT NULL;
