import prisma from "@/lib/db";
import { shouldRunScheduledBackup } from "@/lib/backupScheduleUtils";
import { sendFeesBackupEmail } from "@/lib/sendFeesBackupEmail";

export type FeesBackupCronResult = {
  message: string;
  sent: number;
  results: Array<{
    scheduleId: string;
    ok: boolean;
    error?: string;
    schoolsSent?: string[];
  }>;
};

/** Shared runner used by Vercel/GitHub cron and the local in-process scheduler. */
export async function runFeesBackupCron(): Promise<FeesBackupCronResult> {
  const schedules = await prisma.backupEmailSchedule.findMany({
    where: { enabled: true },
  });

  if (schedules.length === 0) {
    return { message: "No enabled backup schedules", sent: 0, results: [] };
  }

  const results: FeesBackupCronResult["results"] = [];

  for (const schedule of schedules) {
    if (!shouldRunScheduledBackup(schedule.scheduleTime, schedule.lastSentAt)) {
      results.push({ scheduleId: schedule.id, ok: false, error: "Not due yet" });
      continue;
    }

    const result = await sendFeesBackupEmail({
      recipient: schedule.recipient,
      schoolId: schedule.schoolId,
    });

    if (result.ok) {
      await prisma.backupEmailSchedule.update({
        where: { id: schedule.id },
        data: { lastSentAt: new Date() },
      });
      results.push({
        scheduleId: schedule.id,
        ok: true,
        schoolsSent: result.schoolsSent,
      });
    } else {
      results.push({
        scheduleId: schedule.id,
        ok: false,
        error: result.error,
      });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  return { message: "Cron completed", sent, results };
}
