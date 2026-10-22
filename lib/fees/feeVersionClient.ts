/**
 * Browser side of the school fee-data version (see lib/fees/feeDataVersion.ts).
 *
 * The browser keeps copies of a student's fee details (in memory and in tab storage, which survives a
 * refresh). Before such a copy is used, {@link ensureFeeVersionFresh} asks the server for the school's
 * counter, at most once every few seconds. If it differs from the number this tab last saw, every copy is
 * dropped through the flush callbacks the cache modules register, so the next read goes to the server.
 *
 * Anything that goes wrong (offline, a server error, no number) leaves the copies as they are: this check
 * can make the page fresher, never slower to fail.
 */
const STORAGE_KEY = "erp:fee-data-version:v1";
const CHECK_EVERY_MS = 5_000;

const flushers = new Set<() => void>();
let lastCheckAt = 0;
let inflight: Promise<void> | null = null;

/** A cache module registers how to drop all of its copies. Returns an unregister function. */
export function onFeeVersionChange(flush: () => void): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

function readStored(): string | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(version: number): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(STORAGE_KEY, String(version));
  } catch {
    /* storage blocked: the in-flight check still flushed, the next page load will flush again */
  }
}

async function check(): Promise<void> {
  try {
    const res = await fetch("/api/fees/version", { credentials: "include", cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as { version?: number | null } | null;
    const version = data?.version;
    if (typeof version !== "number") return; // unknown: leave the copies alone
    // No stored number means copies were saved before this check existed (or in a cleared tab), so their
    // age is unknown: drop them once rather than trust them.
    if (readStored() !== String(version)) {
      for (const flush of flushers) {
        try {
          flush();
        } catch {
          /* one cache failing to clear must not stop the others */
        }
      }
      writeStored(version);
    }
  } catch {
    /* offline or blocked: keep what we have */
  }
}

/** Call at the top of any function that is about to serve a cached fee copy. */
export async function ensureFeeVersionFresh(): Promise<void> {
  if (typeof window === "undefined") return;
  if (inflight) return inflight;
  if (Date.now() - lastCheckAt < CHECK_EVERY_MS) return;
  inflight = check().finally(() => {
    lastCheckAt = Date.now();
    inflight = null;
  });
  return inflight;
}

/** For tests. */
export function resetFeeVersionClientForTests(): void {
  flushers.clear();
  lastCheckAt = 0;
  inflight = null;
}
