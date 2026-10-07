-- CreateTable
CREATE TABLE "BackupEmailSchedule" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleTime" TEXT NOT NULL DEFAULT '06:00',
    "recipient" TEXT NOT NULL DEFAULT 'timelly26@gmail.com',
    "schoolId" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupEmailSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupEmailSchedule_enabled_idx" ON "BackupEmailSchedule"("enabled");

-- CreateIndex
CREATE INDEX "BackupEmailSchedule_schoolId_idx" ON "BackupEmailSchedule"("schoolId");

-- AddForeignKey
ALTER TABLE "BackupEmailSchedule" ADD CONSTRAINT "BackupEmailSchedule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
