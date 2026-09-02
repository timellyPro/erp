-- CreateEnum
CREATE TYPE "AdmissionWorkflowStatus" AS ENUM ('PENDING', 'UPCOMING', 'APPROVED');

-- AlterTable
ALTER TABLE "StudentApplication" ADD COLUMN "workflowStatus" "AdmissionWorkflowStatus" NOT NULL DEFAULT 'PENDING';

-- Existing converted applications
UPDATE "StudentApplication" SET "workflowStatus" = 'APPROVED' WHERE "studentId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "StudentApplication_workflowStatus_idx" ON "StudentApplication"("workflowStatus");
