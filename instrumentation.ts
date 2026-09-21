export async function register() {
  // Edge sets NEXT_RUNTIME=edge. On Node/Turbopack it may be "nodejs" or unset.
  if (process.env.NEXT_RUNTIME === "edge") return;

  // Vercel serverless: use vercel.json cron instead of an in-process interval.
  if (process.env.VERCEL) return;

  const { startLocalFeesBackupScheduler } = await import(
    "@/lib/localFeesBackupScheduler"
  );
  startLocalFeesBackupScheduler();
}
