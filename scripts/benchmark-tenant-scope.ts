/**
 * Times the heavy fee/analysis helpers on the owner connection vs inside a tenant scope
 * (app_tenant + RLS) and counts round trips, to decide whether TENANT_SCOPE_TIMEOUT_MS
 * (default 30s) is safe. Run it from the DEPLOYMENT REGION against production-sized data:
 *
 *   npx tsx scripts/benchmark-tenant-scope.ts [schoolId]
 *
 * Read-only. Needs DATABASE_URL and DATABASE_URL_TENANT. Picks the school with the most
 * students when no id is given.
 */
import "dotenv/config";
import prisma from "../lib/db";
import { runInTenantScope } from "../lib/db/tenantContext";
import { loadFeeSummaryPage } from "../lib/fees/loadFeeSummaryPage";
import { computeCurrentAndPreviousFeeStats } from "../lib/fees/computeFeeSummaryStats";
import { loadFeeReportTransactions } from "../lib/fees/loadDayFeeCollectionTransactions";
import { buildSchoolAnalysisFast } from "../lib/school/buildSchoolAnalysis";

// Ordering of rows that tie on the sort key (or have no ORDER BY) can differ between the owner
// and scoped connections because RLS changes the query plan - compare content, and report
// exact-order equality separately.
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon).map((x) => JSON.stringify(x)).sort()
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
      : v;

async function pickSchool(arg?: string): Promise<string> {
  if (arg) return arg;
  const top = await prisma.student.groupBy({ by: ["schoolId"], _count: { _all: true }, orderBy: { _count: { schoolId: "desc" } }, take: 1 });
  return top[0].schoolId as string;
}

async function time<T>(fn: () => Promise<T>): Promise<{ ms: number; value?: T; error?: string }> {
  const t = Date.now();
  try {
    const value = await fn();
    return { ms: Date.now() - t, value };
  } catch (e) {
    return { ms: Date.now() - t, error: `${(e as { code?: string }).code ?? ""} ${(e as Error).message}`.slice(0, 120) };
  }
}

(async () => {
  const schoolId = await pickSchool(process.argv[2]);
  const students = await prisma.student.count({ where: { schoolId } });
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const year = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  const cases: Array<[string, () => Promise<unknown>]> = [
    ["fees/summary page (take 50)", () => loadFeeSummaryPage(schoolId, 50, null)],
    ["fees/summary stats", () => computeCurrentAndPreviousFeeStats(schoolId)],
    ["fees/transactions report (YTD)", () => loadFeeReportTransactions(schoolId, yearStart, today)],
    ["school/analysis fast", () => buildSchoolAnalysisFast(schoolId, year, null)],
  ];

  console.log(`school ${schoolId} (${students} students), timeout ${process.env.TENANT_SCOPE_TIMEOUT_MS ?? 30000} ms\n`);
  console.log("case".padEnd(34), "owner ms".padStart(9), "scoped ms".padStart(10), "ratio".padStart(6), "  result");
  for (const [name, run] of cases) {
    const owner = await time(run);
    const scoped = await time(() => runInTenantScope(schoolId, run));
    const ok = !owner.error && !scoped.error;
    const same = ok && JSON.stringify(owner.value) === JSON.stringify(scoped.value);
    const sameContent = ok && JSON.stringify(canon(owner.value)) === JSON.stringify(canon(scoped.value));
    const ratio = owner.ms > 0 ? (scoped.ms / owner.ms).toFixed(2) : "-";
    const verdict = scoped.error ? `SCOPED FAILED: ${scoped.error}` : same ? "identical" : sameContent ? "same content, tie order differs" : "DIFFERS (check)";
    console.log(name.padEnd(34), String(owner.ms).padStart(9), String(scoped.ms).padStart(10), ratio.padStart(6), " ", verdict);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
