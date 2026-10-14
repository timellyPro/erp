/**
 * Applies pending Prisma migrations during a Vercel build, so a deploy can never ship code that needs
 * a migration the database does not have yet.
 *
 * Safety rules:
 *  - Runs ONLY for Vercel *production* builds (VERCEL_ENV === "production"). Preview builds (pull
 *    request branches) and local/CI builds skip it, so an unmerged branch can never migrate a database.
 *  - Each Vercel project migrates the database its own Production env vars point to (the staging
 *    project migrates staging, the production project migrates production).
 *  - If the migration fails, the build fails and the previous deployment keeps serving.
 *  - Opt out for one build with SKIP_MIGRATE_ON_DEPLOY=1.
 *
 * Migrations must stay backward compatible with the currently running code (docs/DEPLOY.md section 5):
 * they run before the new code is live.
 */
const { spawnSync } = require("child_process");

const env = process.env;

function skip(reason) {
  console.log(`[migrate-on-deploy] skipped: ${reason}`);
  process.exit(0);
}

if (env.SKIP_MIGRATE_ON_DEPLOY === "1") skip("SKIP_MIGRATE_ON_DEPLOY=1");
if (env.VERCEL_ENV !== "production") skip(`VERCEL_ENV is "${env.VERCEL_ENV ?? "unset"}", not "production"`);
if (!env.DIRECT_URL && !env.DATABASE_URL) skip("no DIRECT_URL or DATABASE_URL set");

console.log("[migrate-on-deploy] applying pending migrations (prisma migrate deploy)...");
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env });

if (result.status !== 0) {
  console.error("[migrate-on-deploy] migration FAILED: aborting the build so the previous deployment stays live.");
  process.exit(result.status || 1);
}
console.log("[migrate-on-deploy] database is up to date.");
