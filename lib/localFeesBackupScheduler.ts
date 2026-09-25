import { runFeesBackupCron } from "@/lib/runFeesBackupCron";

const INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes
const START_DELAY_MS = 5_000;

declare global {
  // eslint-disable-next-line no-var
  var __feesBackupSchedulerStarted: boolean | undefined;
}

/**
 * Runs only on long-lived Node servers (local `next dev` / `next start`).
 * Skipped on Vercel — use vercel.json cron there instead.
 * Safe to call multiple times (no-op after first start).
 */
export function startLocalFeesBackupScheduler() {
  if (process.env.VERCEL) return;
  if (globalThis.__feesBackupSchedulerStarted) return;
  globalThis.__feesBackupSchedulerStarted = true;

  const tick = async () => {
    try {
      const result = await runFeesBackupCron();
      console.info("[fees-backup-scheduler] tick", {
        sent: result.sent,
        message: result.message,
        results: result.results,
      });
    } catch (err) {
      console.error("[fees-backup-scheduler] failed", err);
    }
  };

  console.info(
    `[fees-backup-scheduler] started (every ${INTERVAL_MS / 60000} min). Daily automation must be ON.`
  );
  setTimeout(() => {
    void tick();
  }, START_DELAY_MS);
  setInterval(() => {
    void tick();
  }, INTERVAL_MS);
}
