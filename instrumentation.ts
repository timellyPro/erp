export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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
}
