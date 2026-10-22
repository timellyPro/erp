import { tenantDb } from "@/lib/db/tenantContext";

/**
 * A per-school counter (SchoolSettings.feeDataVersion) that goes up on every fee change. Cached copies of a
 * student's fee details (the server's memory and each browser) remember the number they were built at and are
 * dropped when it moves, so a change made anywhere, including by a repair script that never touches the
 * app's own caches, cannot leave an old figure on screen.
 *
 * Always read the version BEFORE reading the data it will stamp: a change that commits in between then
 * makes the stamp older than the counter and the copy is simply rebuilt.
 *
 * Failures never break a request: an unreadable version is `null`, meaning "unknown, skip the check".
 */
type VersionDb = {
  schoolSettings: {
    findUnique: (args: { where: { schoolId: string }; select: { feeDataVersion: true } }) => Promise<{ feeDataVersion: number } | null>;
    upsert: (args: {
      where: { schoolId: string };
      create: { schoolId: string; feeDataVersion: number };
      update: { feeDataVersion: { increment: number } };
      select: { feeDataVersion: true };
    }) => Promise<{ feeDataVersion: number }>;
  };
};

/** One process re-reads the counter at most this often, so a busy page does not add a query per request. */
const MEMO_MS = 2_000;
const memo = new Map<string, { version: number; at: number }>();

/** Tests (jest.setup.js) switch the default client off; an explicit `db` argument always works. */
function disabled(): boolean {
  return process.env.FEE_DATA_VERSION === "off";
}

export async function getSchoolFeeDataVersion(
  schoolId: string | null | undefined,
  db?: VersionDb
): Promise<number | null> {
  if (!schoolId) return null;
  if (!db && disabled()) return null;
  const hit = memo.get(schoolId);
  if (!db && hit && Date.now() - hit.at < MEMO_MS) return hit.version;
  try {
    const row = await (db ?? (tenantDb as unknown as VersionDb)).schoolSettings.findUnique({
      where: { schoolId },
      select: { feeDataVersion: true },
    });
    const version = row?.feeDataVersion ?? 0;
    if (!db) memo.set(schoolId, { version, at: Date.now() });
    return version;
  } catch {
    return null;
  }
}

/** Add one to the school's counter (creating its settings row if it has none yet). */
export async function bumpSchoolFeeDataVersion(
  schoolId: string | null | undefined,
  db?: VersionDb
): Promise<number | null> {
  if (!schoolId) return null;
  if (!db && disabled()) return null;
  try {
    const row = await (db ?? (tenantDb as unknown as VersionDb)).schoolSettings.upsert({
      where: { schoolId },
      create: { schoolId, feeDataVersion: 1 },
      update: { feeDataVersion: { increment: 1 } },
      select: { feeDataVersion: true },
    });
    if (!db) memo.set(schoolId, { version: row.feeDataVersion, at: Date.now() });
    return row.feeDataVersion;
  } catch {
    return null;
  }
}

const pending = new Set<Promise<unknown>>();

/**
 * Bump the counter without making the caller wait, but without losing it either: inside a request the
 * platform is asked to keep the invocation alive until the bump has finished (a bare `void` promise can be
 * cut off when the response is sent, which would leave stale copies in place). Outside a request (scripts)
 * await {@link flushPendingFeeDataVersionBumps} before exiting.
 */
export function scheduleFeeDataVersionBump(schoolId: string | null | undefined): Promise<number | null> {
  const task = bumpSchoolFeeDataVersion(schoolId);
  pending.add(task);
  void task.finally(() => pending.delete(task));
  try {
    // Loaded here, not at the top, so modules that only need the counter do not pull in next/server.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { after } = require("next/server") as typeof import("next/server");
    after(() => task);
  } catch {
    // Not inside a Next.js request (a script or a test): the caller flushes instead.
  }
  return task;
}

/** Wait for every scheduled bump to finish. Scripts call this just before they exit. */
export async function flushPendingFeeDataVersionBumps(): Promise<void> {
  await Promise.allSettled([...pending]);
}

/** For tests. */
export function resetFeeDataVersionMemo(): void {
  memo.clear();
  pending.clear();
}
