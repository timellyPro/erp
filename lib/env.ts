/**
 * Startup/health validation of the env vars a production deployment cannot run
 * without. Deliberately returns problems instead of throwing: the app's stance
 * is to stay up and be loud (see CLAUDE.md fail-open notes), and `/api/health`
 * turns these into a 503 so an uptime monitor or deploy gate catches them.
 *
 * Only checks presence/shape, never logs values.
 */

type EnvProblem = string;

/** Each entry is satisfied if ANY listed variable is set. */
const REQUIRED_IN_PRODUCTION: ReadonlyArray<readonly string[]> = [
  ["DATABASE_URL", "DIRECT_URL"],
  // Missing => every RLS-migrated route returns 500 (lib/db/tenantContext.ts).
  ["DATABASE_URL_TENANT"],
  ["NEXTAUTH_SECRET"],
  ["NEXTAUTH_URL"],
  // Missing => /api/cron/* always answers 401 and scheduled jobs silently stop.
  ["CRON_SECRET"],
];

export function getEnvProblems(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  if (env.NODE_ENV !== "production") return [];

  const problems: EnvProblem[] = [];
  for (const anyOf of REQUIRED_IN_PRODUCTION) {
    if (!anyOf.some((name) => env[name]?.trim())) {
      problems.push(`${anyOf.join(" or ")} is not set`);
    }
  }

  const url = env.NEXTAUTH_URL?.trim();
  if (url && !url.startsWith("https://")) {
    // Without https NextAuth skips the __Secure- cookie prefix and secure flag.
    problems.push("NEXTAUTH_URL must start with https:// in production");
  }

  return problems;
}
