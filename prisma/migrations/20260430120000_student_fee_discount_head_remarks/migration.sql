-- AlterTable
ALTER TABLE "StudentFee" ADD COLUMN IF NOT EXISTS "discountFeeHeadKey" TEXT;
ALTER TABLE "StudentFee" ADD COLUMN IF NOT EXISTS "discountFeeHeadLabel" TEXT;
ALTER TABLE "StudentFee" ADD COLUMN IF NOT EXISTS "discountRemarks" TEXT;
