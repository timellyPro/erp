import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";

const MEMORY_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** Bump when breakdown attribution logic changes so stale session totals are dropped. */
const SESSION_KEY = "erp:fee-breakdown:v3";
const MAX_SESSION_ENTRIES = 80;

const memory = new Map<string, { expiresAt: number; value: AdminStudentFeeBreakdownResult }>();
const inflight = new Map<string, Promise<AdminStudentFeeBreakdownResult | null>>();

type SessionStore = Record<string, { savedAt: number; value: AdminStudentFeeBreakdownResult }>;

function readSessionStore(): SessionStore {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SessionStore;
  } catch {
    return {};
  }
}

function writeSessionStore(store: SessionStore): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys = Object.keys(store).sort(
      (a, b) => (store[b]?.savedAt ?? 0) - (store[a]?.savedAt ?? 0)
    );
    while (keys.length > MAX_SESSION_ENTRIES) {
      delete store[keys.pop() as string];
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

function readSessionBreakdown(studentId: string): AdminStudentFeeBreakdownResult | null {
  const store = readSessionStore();
  const entry = store[studentId];
  if (!entry || Date.now() - entry.savedAt > SESSION_TTL_MS) {
    if (entry) {
      delete store[studentId];
      writeSessionStore(store);
    }
    return null;
  }
  return entry.value;
}

function writeSessionBreakdown(studentId: string, value: AdminStudentFeeBreakdownResult): void {
  const store = readSessionStore();
  store[studentId] = { savedAt: Date.now(), value };
  writeSessionStore(store);
}

/** Memory + session — instant on revisit (production-style client cache). */
export function getFeeBreakdownCached(
  studentId: string
): AdminStudentFeeBreakdownResult | null {
  const mem = memory.get(studentId);
  if (mem && Date.now() < mem.expiresAt) return mem.value;
  return readSessionBreakdown(studentId);
}

export function peekFeeBreakdownCache(studentId: string): AdminStudentFeeBreakdownResult | null {
  return getFeeBreakdownCached(studentId);
}

export function setFeeBreakdownCache(
  studentId: string,
  value: AdminStudentFeeBreakdownResult | null
): void {
  if (!value) return;
  memory.set(studentId, { value, expiresAt: Date.now() + MEMORY_TTL_MS });
  writeSessionBreakdown(studentId, value);
}

export function invalidateFeeBreakdownCache(studentId?: string): void {
  if (studentId) {
    memory.delete(studentId);
    const store = readSessionStore();
    delete store[studentId];
    writeSessionStore(store);
    inflight.delete(studentId);
    return;
  }
  memory.clear();
  inflight.clear();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

export async function fetchFeeBreakdownFast(
  studentId: string,
  options?: { signal?: AbortSignal; force?: boolean; minAmountPaid?: number }
): Promise<AdminStudentFeeBreakdownResult | null> {
  if (!options?.force) {
    const cached = getFeeBreakdownCached(studentId);
    // Ignore cache that undercounts paid vs shell / payments (stale orphan-attribution).
    const minPaid = options?.minAmountPaid;
    if (
      cached &&
      (minPaid == null || cached.amountPaid + 0.02 >= minPaid)
    ) {
      return cached;
    }
  }

  const running = inflight.get(studentId);
  if (running) return running;

  const run = (async (): Promise<AdminStudentFeeBreakdownResult | null> => {
    const res = await fetch(
      `/api/fees/admin/breakdown?studentId=${encodeURIComponent(studentId)}&fast=1${options?.force ? "&refresh=1" : ""}`,
      { credentials: "include", cache: "no-store", signal: options?.signal }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const breakdown = data as AdminStudentFeeBreakdownResult;
    setFeeBreakdownCache(studentId, breakdown);
    return breakdown;
  })();

  inflight.set(studentId, run);
  try {
    return await run;
  } finally {
    inflight.delete(studentId);
  }
}
