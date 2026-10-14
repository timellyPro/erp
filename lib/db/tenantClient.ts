import { PrismaClient } from "@prisma/client";

/**
 * A second, opt-in Prisma connection using the restricted `app_tenant`
 * Postgres role (see prisma/migrations/20260923104016_create_app_tenant_role
 * and docs/SECURITY_REVIEW.md). Unlike the app's normal `lib/db.ts` client -
 * which connects as the table-owning role and always bypasses RLS - queries
 * run through this client are genuinely restricted by the RLS policies added
 * in the two `..._rls_policies_..._schoolid_tables` migrations, PROVIDED the
 * caller sets `app.current_school_id` first (see `withTenantScopedClient`
 * below). Proven correct against real production data in this session: a
 * connection with no context set sees zero rows, and a connection scoped to
 * school A cannot read school B's data even when explicitly asked to.
 *
 * NOT wired into any route yet. Existing routes continue to rely entirely on
 * `requireSchoolId()` (lib/auth/tenant.ts) for tenant scoping - switching a
 * route to use this client is a deliberate, one-route-at-a-time decision
 * (query shape has to move from `where: { schoolId }` to relying on RLS,
 * every affected Prisma call in that route has to move inside the same
 * transaction, and the route needs its own before/after isolation test run
 * against the real DB, not just mocks). See docs/SECURITY_REVIEW.md for the
 * full rollout plan.
 *
 * Requires DATABASE_URL_TENANT to be set (same connection details as
 * DATABASE_URL/DIRECT_URL, but with the app_tenant role's own username and
 * password - Supabase's pooler expects "app_tenant.<project-ref>" as the
 * username). Throws at first use if that env var is missing, rather than
 * silently falling back to an unscoped connection.
 */
let tenantClientSingleton: PrismaClient | null = null;

function getTenantConnectionString(): string {
  const url = process.env.DATABASE_URL_TENANT;
  if (!url) {
    throw new Error(
      "DATABASE_URL_TENANT is not set. This must be the app_tenant role's own " +
        "connection string (see prisma/migrations/20260923104016_create_app_tenant_role), " +
        "not the app's normal DATABASE_URL - never fall back to the owning-role connection here."
    );
  }
  return url;
}

function withParam(url: string, key: string, value: string): string {
  if (new RegExp(`[?&]${key}=`).test(url)) return url; // respect explicit settings
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`;
}

// Same pool tuning as lib/db.ts; without it this client used Prisma's tiny default
// pool, so concurrent tab requests queued for a connection and burned their tx timeout.
function getTenantClient(): PrismaClient {
  if (!tenantClientSingleton) {
    let url = getTenantConnectionString();
    url = withParam(url, "connection_limit", process.env.PRISMA_CONNECTION_LIMIT || (process.env.NODE_ENV === "development" ? "20" : "5"));
    url = withParam(url, "pool_timeout", "30");
    url = withParam(url, "connect_timeout", "10");
    tenantClientSingleton = new PrismaClient({ datasourceUrl: url });
  }
  return tenantClientSingleton;
}

/**
 * Runs `fn` inside a single Postgres transaction on the app_tenant
 * connection, with `app.current_school_id` set to `schoolId` for the
 * duration of that transaction. SET LOCAL only lasts for the transaction
 * it's issued in, so every Prisma call `fn` makes MUST go through the `tx`
 * handle it's given, not the module-level tenant client or (worse) the
 * app's normal `lib/db.ts` prisma export - either of those would run
 * outside this transaction/connection and see either unscoped data (normal
 * client) or a zero-context connection (tenant client without the SET
 * LOCAL applied yet).
 *
 * schoolId must come from requireSchoolId(session) - never from client
 * input - same rule as every existing route's application-level scoping.
 */
export async function withTenantScopedClient<T>(
  schoolId: string,
  fn: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => Promise<T>,
  options?: { timeout?: number; maxWait?: number }
): Promise<T> {
  const client = getTenantClient();
  return client.$transaction(async (tx) => {
    // Parameterized via $executeRaw (not string interpolation) - schoolId is
    // still attacker-reachable indirectly (it's the session's own, but this
    // keeps the pattern injection-safe regardless of where schoolId call
    // sites ever get threaded from).
    await tx.$executeRaw`SELECT set_config('app.current_school_id', ${schoolId}, true)`;
    return fn(tx);
  }, {
    // Prisma's default is 5s, which a slow remote DB blows through (P2028). Matches
    // TENANT_SCOPE_TIMEOUT_MS / its max wait in tenantContext.ts (not imported: cycle).
    timeout: options?.timeout ?? (Number(process.env.TENANT_SCOPE_TIMEOUT_MS) || 30_000),
    maxWait: options?.maxWait ?? 10_000,
  });
}
