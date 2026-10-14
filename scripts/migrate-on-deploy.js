/**
 * Applies pending Prisma migrations during a Vercel build, so a deploy can never ship code that needs
 * a migration the database does not have yet.
 *
 * Safety rules:
 *  - Runs ONLY for Vercel *production* builds (VERCEL_ENV === "production"). Preview builds (pull
 *    request branches) and local/CI builds skip it, so an unmerged branch can never migrate a database.
 *  - Each Vercel project migrates the database its own Production env vars point to (the staging
 *    project migrates staging, the production project migrates production).
 *  - Migrations need a SESSION connection (advisory locks). A Supabase transaction-pooler URL (port
 *    6543 / pgbouncer=true) hangs or fails, so such a URL is rewritten to the session pooler (port 5432)
 *    of the same host and credentials before running.
 *  - A hard timeout stops a stuck migration from holding the build for ~45 minutes.
 *  - If the migration fails, the build fails and the previous deployment keeps serving.
 *  - Opt out for one build with SKIP_MIGRATE_ON_DEPLOY=1.
 *
 * Migrations must stay backward compatible with the currently running code (docs/DEPLOY.md section 5):
 * they run before the new code is live.
 */
const { spawnSync } = require("child_process");

const TIMEOUT_MS = 10 * 60 * 1000;

/** Turn a transaction-pooler URL (:6543 / pgbouncer=true) into a session connection URL (:5432). */
function toSessionUrl(url) {
  return url
    .replace(/:6543\//, ":5432/")
    .replace(/([?&])pgbouncer=true(&|$)/, (_m, lead, tail) => (tail ? lead : ""))
    .replace(/[?&]$/, "");
}

function main(env) {
  const skip = (reason) => {
    console.log(`[migrate-on-deploy] skipped: ${reason}`);
    return 0;
  };

  if (env.SKIP_MIGRATE_ON_DEPLOY === "1") return skip("SKIP_MIGRATE_ON_DEPLOY=1");
  if (env.VERCEL_ENV !== "production") return skip(`VERCEL_ENV is "${env.VERCEL_ENV ?? "unset"}", not "production"`);
  const raw = env.DIRECT_URL || env.DATABASE_URL;
  if (!raw) return skip("no DIRECT_URL or DATABASE_URL set");

  const url = toSessionUrl(raw);
  if (url !== raw) console.log("[migrate-on-deploy] DIRECT_URL was a transaction-pooler URL; using the session port (5432) for migrations.");

  console.log("[migrate-on-deploy] applying pending migrations (prisma migrate deploy)...");
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...env, DATABASE_URL: url, DIRECT_URL: url },
    timeout: TIMEOUT_MS,
    killSignal: "SIGKILL",
  });

  if (result.error && result.error.code === "ETIMEDOUT") {
    console.error(`[migrate-on-deploy] migration TIMED OUT after ${TIMEOUT_MS / 60000} minutes: aborting the build.`);
    return 1;
  }
  if (result.status !== 0) {
    console.error("[migrate-on-deploy] migration FAILED: aborting the build so the previous deployment stays live.");
    return result.status || 1;
  }
  console.log("[migrate-on-deploy] database is up to date.");
  return 0;
}

if (require.main === module) {
  process.exit(main(process.env));
}

module.exports = { toSessionUrl, main };
