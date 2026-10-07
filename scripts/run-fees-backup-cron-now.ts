import prisma from "../lib/db";
import { shouldRunScheduledBackup } from "../lib/backupScheduleUtils";
import { runFeesBackupCron } from "../lib/runFeesBackupCron";

async function main() {
  const now = new Date();
  const ist = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = parseInt(ist.find((p) => p.type === "hour")?.value || "0", 10) % 24;
  const minute = parseInt(ist.find((p) => p.type === "minute")?.value || "0", 10);
  let pastMin = minute - 2;
  let pastHour = hour;
  if (pastMin < 0) {
    pastMin += 60;
    pastHour = (pastHour + 23) % 24;
  }
  const scheduleTime = `${String(pastHour).padStart(2, "0")}:${String(pastMin).padStart(2, "0")}`;

  const existing = await prisma.backupEmailSchedule.findFirst({ orderBy: { createdAt: "asc" } });
  if (!existing) throw new Error("no schedule row");

  await prisma.backupEmailSchedule.update({
    where: { id: existing.id },
    data: {
      enabled: true,
      scheduleTime,
      recipient: "timelly26@gmail.com",
      lastSentAt: null,
    },
  });

  console.log({
    scheduleTime,
    nowIST: `${hour}:${String(minute).padStart(2, "0")}`,
    shouldRun: shouldRunScheduledBackup(scheduleTime, null, now),
  });

  console.log("Sending via cron...");
  const result = await runFeesBackupCron();
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
