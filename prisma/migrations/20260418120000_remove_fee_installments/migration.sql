-- Remove installment model and settings; fees are paid against totals only.
DROP TABLE IF EXISTS "FeeInstallment";

ALTER TABLE "StudentFee" DROP COLUMN IF EXISTS "installments";

ALTER TABLE "SchoolSettings" DROP COLUMN IF EXISTS "defaultInstallments";
ALTER TABLE "SchoolSettings" DROP COLUMN IF EXISTS "installmentReminderDates";
