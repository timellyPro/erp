-- Optional two-installment display for extra fees and saved catalog templates
ALTER TABLE "ExtraFee" ADD COLUMN "splitIntoTwoInstallments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExtraFeeHeadTemplate" ADD COLUMN "splitIntoTwoInstallments" BOOLEAN NOT NULL DEFAULT false;
