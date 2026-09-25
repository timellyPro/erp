-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "collectedByUserId" TEXT,
ADD COLUMN "collectedByName" TEXT;

-- CreateIndex
CREATE INDEX "Payment_collectedByUserId_idx" ON "Payment"("collectedByUserId");

-- CreateIndex
CREATE INDEX "Payment_collectedByUserId_createdAt_idx" ON "Payment"("collectedByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
