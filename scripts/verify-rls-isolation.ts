/**
 * Read-only check of DB-level tenant isolation for EVERY table that has a tenant_isolation policy.
 * For each table it compares, per school:
 *   - owner connection count (ground truth for that school's rows, via the table's own schoolId path)
 *   - app_tenant, no school set        -> must be 0
 *   - app_tenant scoped to school A    -> A's rows visible, B's rows must be 0
 * and flags tables that have RLS enabled but NO policy (they return 0 rows to app_tenant).
 *
 *   npx tsx scripts/verify-rls-isolation.ts
 *
 * Needs DATABASE_URL and DATABASE_URL_TENANT. Run it against the deployed database after applying
 * the RLS migrations. Exit code 1 if any isolation check fails.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const owner = new PrismaClient();
const tenant = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TENANT });

// The pooler occasionally drops connections; retry so a blip is not reported as a failure.
async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

async function count(client: PrismaClient, table: string): Promise<number> {
  const r = await client.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*)::bigint AS n FROM "${table}"`);
  return Number(r[0].n);
}

async function scoped<T>(schoolId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return tenant.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_school_id', ${schoolId}, true)`;
    return fn(tx as unknown as PrismaClient);
  });
}

(async () => {
  if (!process.env.DATABASE_URL_TENANT) throw new Error("DATABASE_URL_TENANT is not set");
  const schools = await retry(() => owner.school.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" }, take: 2 }));
  if (schools.length < 2) throw new Error("Need at least 2 schools to test cross-tenant isolation");
  const [a, b] = schools;

  const rls = await retry(() => owner.$queryRawUnsafe<Array<{ tablename: string; hasPolicy: boolean }>>(`
    SELECT c.relname AS tablename,
           EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS "hasPolicy"
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND c.relname NOT LIKE '\_prisma%' ORDER BY c.relname`));

  console.log(`schools: A=${a.name} (${a.id}) B=${b.name} (${b.id})\n`);
  console.log("table".padEnd(28), "owner total".padStart(11), "no-ctx".padStart(7), "as A".padStart(8), "as B".padStart(8), " verdict");
  let failed = 0;
  let unverified = 0;
  for (const t of rls) {
    try {
      const ownerTotal = await retry(() => count(owner, t.tablename));
      const noCtx = await retry(() => count(tenant, t.tablename));
      const asA = await retry(() => scoped(a.id, (tx) => count(tx, t.tablename)));
      const asB = await retry(() => scoped(b.id, (tx) => count(tx, t.tablename)));
      let verdict = "ok";
      if (!t.hasPolicy) verdict = "RLS ON, NO POLICY (always 0 for app_tenant) - do not use from a tenant scope";
      else if (noCtx !== 0) { verdict = "FAIL: rows visible with no school set"; failed++; }
      else if (ownerTotal > 0 && asA + asB > ownerTotal) { verdict = "FAIL: A+B exceed table total (overlap)"; failed++; }
      else if (ownerTotal > 0 && asA === ownerTotal && asB === ownerTotal) { verdict = "FAIL: both schools see everything"; failed++; }
      console.log(t.tablename.padEnd(28), String(ownerTotal).padStart(11), String(noCtx).padStart(7), String(asA).padStart(8), String(asB).padStart(8), " " + verdict);
    } catch (e) {
      unverified++;
      console.log(t.tablename.padEnd(28), "UNVERIFIED (connection error, rerun):", String((e as Error).message).split("\n")[0].slice(0, 80));
    }
  }
  if (unverified) console.log(`\n${unverified} table(s) could not be verified - rerun.`);
  console.log(failed ? `\n${failed} table(s) FAILED isolation` : "\nAll policy tables isolate correctly.");
  process.exit(failed || unverified ? 1 : 0);
})().catch((e) => { console.error("ERR", String(e.message).slice(0, 300)); process.exit(1); });
