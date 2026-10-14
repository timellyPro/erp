import { AsyncLocalStorage } from "async_hooks";
import prisma from "@/lib/db";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { logger } from "@/lib/logger";

/**
 * Request-scoped tenant transaction, for routes whose queries go through
 * shared helpers (lib/fees, lib/school, ...) that import `prisma` directly.
 *
 * `runInTenantScope(schoolId, fn)` opens ONE app_tenant transaction with
 * `app.current_school_id` set (see `withTenantScopedClient`) and stores it in
 * AsyncLocalStorage for the duration of `fn`. Helpers import `tenantDb`
 * instead of `prisma`: inside a scope every call runs on that RLS-restricted
 * transaction; outside a scope (scripts, cron, not-yet-migrated routes) it
 * falls back to the normal owner-role client, i.e. the pre-migration
 * behaviour. Migrating a route = wrapping its DB work in `runInTenantScope`.
 *
 * Limits: one transaction runs its queries serially (no parallelism, no
 * read-collapsing from the shared prisma extension), the transaction cannot
 * open a real nested transaction (`tenantDb.$transaction` joins the scope's one), and it is bounded by TENANT_SCOPE_TIMEOUT_MS.
 */
type TenantTx = Parameters<Parameters<typeof withTenantScopedClient>[1]>[0];

const scopeStorage = new AsyncLocalStorage<TenantTx>();

export const TENANT_SCOPE_TIMEOUT_MS = Number(process.env.TENANT_SCOPE_TIMEOUT_MS) || 30_000;
const TENANT_SCOPE_MAX_WAIT_MS = 10_000;

// P2028 means Prisma failed to even ACQUIRE a connection to open the transaction within
// maxWait - the transaction body (fn) never started, so nothing has run yet and retrying
// is always safe, unlike a mid-query failure where a write might have already landed.
const SCOPE_RETRY_COUNT = Number(process.env.TENANT_SCOPE_RETRY_COUNT || "2");
const SCOPE_RETRY_DELAY_MS = Number(process.env.TENANT_SCOPE_RETRY_DELAY_MS || "300");

export async function runInTenantScope<T>(
  schoolId: string,
  fn: (schoolId: string) => Promise<T>,
  options?: { timeout?: number }
): Promise<T> {
  // Already inside a scope (nested helper) - reuse it; never open a second tx.
  if (scopeStorage.getStore()) return fn(schoolId);
  const timeout = options?.timeout ?? TENANT_SCOPE_TIMEOUT_MS;

  for (let attempt = 0; attempt <= SCOPE_RETRY_COUNT; attempt++) {
    const startedAt = Date.now();
    try {
      const result = await withTenantScopedClient(
        schoolId,
        (tx) => scopeStorage.run(tx, () => fn(schoolId)),
        { timeout, maxWait: TENANT_SCOPE_MAX_WAIT_MS }
      );
      const ms = Date.now() - startedAt;
      // Early warning well before the hard timeout turns into a 500 (P2028).
      if (ms > timeout * 0.5) {
        logger.warn("tenant_scope_slow", { schoolId, ms, timeout });
      }
      return result;
    } catch (error) {
      const isPoolTimeout = (error as { code?: string })?.code === "P2028";
      if (!isPoolTimeout || attempt === SCOPE_RETRY_COUNT) {
        if (isPoolTimeout) {
          logger.error("tenant_scope_timeout (P2028)", {
            schoolId,
            ms: Date.now() - startedAt,
            timeout,
            attempt: attempt + 1,
            hint: "raise TENANT_SCOPE_TIMEOUT_MS or move this route's heavy reads out of the scope",
          });
        }
        throw error;
      }
      logger.warn("tenant_scope_retry (P2028)", { schoolId, attempt: attempt + 1 });
      await new Promise((r) => setTimeout(r, SCOPE_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  // Unreachable - loop always returns or throws.
  throw new Error("runInTenantScope: exhausted retries without result");
}

export function isInTenantScope(): boolean {
  return scopeStorage.getStore() !== undefined;
}

export const tenantDb: typeof prisma = new Proxy(prisma, {
  get(_target, prop) {
    const store = scopeStorage.getStore();
    // The scope IS already one transaction, so a nested `$transaction` joins it: callback
    // form runs against the same tx, array form awaits the (lazy) queries together.
    if (store && prop === "$transaction") {
      return (arg: unknown) =>
        typeof arg === "function"
          ? (arg as (tx: unknown) => Promise<unknown>)(store)
          : Promise.all(arg as Promise<unknown>[]);
    }
    const active = (scopeStorage.getStore() ?? prisma) as unknown as Record<string | symbol, unknown>;
    const value = active[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(active) : value;
  },
});

/**
 * For routes with a legitimate unscoped path (a student reading their OWN record,
 * a SUPERADMIN reading across tenants): scope when a schoolId applies, otherwise
 * run on the owner connection exactly as before. Callers must pass a null/undefined
 * schoolId only for those deliberate cases.
 */
export function runInOptionalTenantScope<T>(
  schoolId: string | null | undefined,
  fn: () => Promise<T>
): Promise<T> {
  return schoolId ? runInTenantScope(schoolId, () => fn()) : fn();
}
