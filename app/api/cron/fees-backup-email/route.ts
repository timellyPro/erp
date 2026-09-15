import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { shouldRunScheduledBackup } from "@/lib/backupScheduleUtils";
import { sendFeesBackupEmail } from "@/lib/sendFeesBackupEmail";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

/**
 * GET /api/cron/fees-backup-email
 * Called by Vercel Cron (or external scheduler). Sends daily backup when schedule time is reached.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const schedules = await prisma.backupEmailSchedule.findMany({
      where: { enabled: true },
    });

    if (schedules.length === 0) {
      return NextResponse.json({ message: "No enabled backup schedules", sent: 0 });
    }

    const results: Array<{ scheduleId: string; ok: boolean; error?: string; schoolsSent?: string[] }> = [];

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
        results.push({ scheduleId: schedule.id, ok: true, schoolsSent: result.schoolsSent });
      } else {
        results.push({ scheduleId: schedule.id, ok: false, error: result.error });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    return NextResponse.json({ message: "Cron completed", sent, results });
  } catch (error: unknown) {
    console.error("Fees backup email cron error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
