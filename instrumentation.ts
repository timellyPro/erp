export async function register() {
  // Edge sets NEXT_RUNTIME=edge. On Node/Turbopack it may be "nodejs" or unset.
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (!process.env.DATABASE_URL_TENANT) {
    // Tenant-scoped routes (lib/db/tenantContext.ts) throw on first use without this,
    // so surface it at boot rather than as scattered 500s.
    console.error(
      "[startup] DATABASE_URL_TENANT is not set: every RLS-migrated route will return 500. " +
        "Set it to the app_tenant role's connection string (docs/SECURITY_REVIEW.md, section 3)."
    );
  }
  const { getEnvProblems } = await import("./lib/env");
  for (const problem of getEnvProblems()) {
    console.error(`[startup] config problem: ${problem} (see .env.example)`);
  }

  // Vercel serverless: use vercel.json cron instead of an in-process interval.
  if (process.env.VERCEL) return;

  const { startLocalFeesBackupScheduler } = await import(
    "@/lib/fees/localFeesBackupScheduler"
  );
  startLocalFeesBackupScheduler();
}
