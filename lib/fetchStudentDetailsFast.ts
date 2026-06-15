import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";
import type { StudentDetailsTabExtras, StudentDetailsTabPayload } from "@/lib/buildStudentDetailsTabPayload";
import { invalidateStudentDetailsCoreCache } from "@/lib/studentDetailsCoreCache";
import {
  fetchFeeBreakdownFast,
  getFeeBreakdownCached,
  invalidateFeeBreakdownCache,
  setFeeBreakdownCache,
} from "@/lib/feeBreakdownClientCache";

export type StudentDetailsFastBundle = StudentDetailsTabPayload & {
  feeBreakdown: AdminStudentFeeBreakdownResult | null;
};

const bundleMemory = new Map<string, { expiresAt: number; value: StudentDetailsFastBundle }>();
const bundleInflight = new Map<string, Promise<StudentDetailsFastBundle>>();
const extrasInflight = new Map<string, Promise<StudentDetailsTabExtras>>();

const BUNDLE_TTL_MS = 30 * 60 * 1000;
const SESSION_KEY = "erp:student-details-bundle:v2";
const SESSION_TTL_MS = 30 * 60 * 1000;

type SessionStore = Record<string, { savedAt: number; value: StudentDetailsFastBundle }>;

function readSession(): SessionStore {
  if (typeof sessionStorage === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as SessionStore;
  } catch {
    return {};
  }
}

function writeSession(store: SessionStore): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys = Object.keys(store);
    if (keys.length > 12) {
      keys
        .sort((a, b) => (store[b]?.savedAt ?? 0) - (store[a]?.savedAt ?? 0))
        .slice(12)
        .forEach((k) => delete store[k]);
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

function readSessionBundle(studentId: string): StudentDetailsFastBundle | null {
  const store = readSession();
  const entry = store[studentId];
  if (!entry || Date.now() - entry.savedAt > SESSION_TTL_MS) {
    if (entry) {
      delete store[studentId];
      writeSession(store);
    }
    return null;
  }
  return entry.value;
}

function writeSessionBundle(studentId: string, value: StudentDetailsFastBundle): void {
  const store = readSession();
  store[studentId] = { savedAt: Date.now(), value };
  writeSession(store);
}

function parseShell(data: unknown): StudentDetailsTabPayload {
  const payload = data as StudentDetailsTabPayload;
  return {
    ...payload,
    payments: payload.payments ?? [],
    attendanceTrends: payload.attendanceTrends ?? [],
    academicPerformance: payload.academicPerformance ?? [],
    certificates: payload.certificates ?? [],
  };
}

function parseExtras(data: unknown): StudentDetailsTabExtras {
  const d = data as StudentDetailsTabExtras;
  return {
    payments: d.payments ?? [],
    attendanceTrends: d.attendanceTrends ?? [],
    academicPerformance: d.academicPerformance ?? [],
    certificates: d.certificates ?? [],
  };
}

function emptyExtras(): StudentDetailsTabExtras {
  return {
    payments: [],
    attendanceTrends: [],
    academicPerformance: [],
    certificates: [],
  };
}

function toBundle(
  shell: StudentDetailsTabPayload,
  extras: StudentDetailsTabExtras,
  feeBreakdown: AdminStudentFeeBreakdownResult | null
): StudentDetailsFastBundle {
  return { ...shell, ...extras, feeBreakdown };
}

function cacheBundle(studentId: string, bundle: StudentDetailsFastBundle): void {
  bundleMemory.set(studentId, { value: bundle, expiresAt: Date.now() + BUNDLE_TTL_MS });
  writeSessionBundle(studentId, bundle);
}

export function peekStudentDetailsFast(studentId: string): StudentDetailsFastBundle | null {
  const entry = bundleMemory.get(studentId);
  const hit =
    entry && Date.now() < entry.expiresAt ? entry.value : readSessionBundle(studentId);
  if (!hit) return null;
  // Shell-only cache (payments load separately) — do not treat as complete.
  const paid = hit.fee?.amountPaid ?? 0;
  if (hit.payments.length === 0 && paid > 0) return null;
  return hit;
}

/** Prefetch profile + fees when hovering a student link (no-op if already cached). */
export function warmStudentDetailsBundle(studentId: string): void {
  if (!studentId.trim() || peekStudentDetailsFast(studentId)) return;
  void fetchStudentDetailsFast(studentId).catch(() => {});
}

export function invalidateStudentDetailsFast(studentId?: string) {
  if (studentId) {
    bundleMemory.delete(studentId);
    bundleInflight.delete(studentId);
    extrasInflight.delete(studentId);
    invalidateStudentDetailsCoreCache(studentId);
    invalidateFeeBreakdownCache(studentId);
    const store = readSession();
    delete store[studentId];
    writeSession(store);
    return;
  }
  bundleMemory.clear();
  bundleInflight.clear();
  extrasInflight.clear();
  invalidateFeeBreakdownCache();
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
}

/** Targeted refresh after fee payment / structure save — payments first, breakdown in background. */
export async function refreshStudentFeesAfterMutation(
  studentId: string,
  options?: {
    onPartial?: (bundle: StudentDetailsFastBundle) => void;
    /** Reuse current profile shell to skip slow core refetch after payment. */
    keepShell?: StudentDetailsTabPayload | null;
    /** Keep client fee-breakdown cache (already patched optimistically after payment). */
    keepPatchedBreakdown?: boolean;
  }
): Promise<StudentDetailsFastBundle | null> {
  if (options?.keepPatchedBreakdown) {
    bundleMemory.delete(studentId);
    bundleInflight.delete(studentId);
    extrasInflight.delete(studentId);
    invalidateStudentDetailsCoreCache(studentId);
  } else {
    invalidateStudentDetailsFast(studentId);
  }

  const existingShell = options?.keepShell;
  if (!existingShell?.student) {
    try {
      const [shellRes, extrasRes, breakdown] = await Promise.all([
        fetch(
          `/api/student/${encodeURIComponent(studentId)}/details-bundle?shell=1&refresh=1`,
          { credentials: "include", cache: "no-store" }
        ),
        fetch(
          `/api/student/${encodeURIComponent(studentId)}/details-bundle?extras=1`,
          { credentials: "include", cache: "no-store" }
        ),
        fetchFeeBreakdownFast(studentId, { force: true }),
      ]);

      const shellData = await shellRes.json().catch(() => ({}));
      if (!shellRes.ok || !(shellData as { student?: unknown })?.student) {
        return null;
      }

      const shell = parseShell(shellData);
      const extras = extrasRes.ok ? parseExtras(await extrasRes.json().catch(() => ({}))) : emptyExtras();
      const feeBreakdown = breakdown ?? null;
      if (feeBreakdown) setFeeBreakdownCache(studentId, feeBreakdown);

      const bundle = toBundle(shell, extras, feeBreakdown);
      cacheBundle(studentId, bundle);
      options?.onPartial?.(bundle);
      return bundle;
    } catch {
      return null;
    }
  }

  try {
    const extrasRes = await fetch(
      `/api/student/${encodeURIComponent(studentId)}/details-bundle?extras=1`,
      { credentials: "include", cache: "no-store" }
    );
    const extras = extrasRes.ok ? parseExtras(await extrasRes.json().catch(() => ({}))) : emptyExtras();

    // Keep optimistic breakdown visible — only replace UI when fresh server data arrives.
    void fetchFeeBreakdownFast(studentId, { force: true }).then((breakdown) => {
      if (!breakdown) return;
      setFeeBreakdownCache(studentId, breakdown);
      const full = toBundle(existingShell, extras, breakdown);
      cacheBundle(studentId, full);
      options?.onPartial?.(full);
    });

    return toBundle(existingShell, extras, getFeeBreakdownCached(studentId));
  } catch {
    return null;
  }
}

async function fetchExtras(
  studentId: string,
  signal?: AbortSignal,
  force?: boolean
): Promise<StudentDetailsTabExtras> {
  if (force) {
    extrasInflight.delete(studentId);
  }

  const running = force ? undefined : extrasInflight.get(studentId);
  if (running) return running;

  const query = force ? "extras=1&refresh=1" : "extras=1";
  const run = fetch(
    `/api/student/${encodeURIComponent(studentId)}/details-bundle?${query}`,
    { credentials: "include", cache: "no-store", signal }
  )
    .then(async (res) => (res.ok ? parseExtras(await res.json().catch(() => ({}))) : emptyExtras()))
    .catch(() => emptyExtras());

  extrasInflight.set(studentId, run);
  try {
    return await run;
  } finally {
    extrasInflight.delete(studentId);
  }
}

/**
 * One core API call (profile + fees, single DB student read), then extras in background.
 */
export async function fetchStudentDetailsFast(
  studentId: string,
  options?: {
    signal?: AbortSignal;
    /** Skip client cache and refetch core from server (e.g. after status change). */
    force?: boolean;
    onShellLoaded?: (bundle: StudentDetailsFastBundle) => void;
    onBreakdownLoaded?: (breakdown: AdminStudentFeeBreakdownResult) => void;
    onExtrasLoaded?: (bundle: StudentDetailsFastBundle) => void;
  }
): Promise<StudentDetailsFastBundle> {
  if (options?.force) {
    bundleMemory.delete(studentId);
    bundleInflight.delete(studentId);
    extrasInflight.delete(studentId);
    const store = readSession();
    delete store[studentId];
    writeSession(store);
  }

  if (!options?.force) {
    const mem = bundleMemory.get(studentId);
    if (mem && Date.now() < mem.expiresAt) {
      return mem.value;
    }

    const sessionHit = readSessionBundle(studentId);
    if (sessionHit) {
      bundleMemory.set(studentId, { value: sessionHit, expiresAt: Date.now() + BUNDLE_TTL_MS });
      return sessionHit;
    }
  }

  const running = options?.force ? undefined : bundleInflight.get(studentId);
  if (running) return running;

  const run = (async (): Promise<StudentDetailsFastBundle> => {
    const cachedBreakdown = getFeeBreakdownCached(studentId);
    if (cachedBreakdown) options?.onBreakdownLoaded?.(cachedBreakdown);

    const shellQuery = options?.force ? "shell=1&refresh=1" : "shell=1";
    const breakdownPromise =
      cachedBreakdown && !options?.force
        ? Promise.resolve(cachedBreakdown)
        : fetchFeeBreakdownFast(studentId, {
            signal: options?.signal,
            force: options?.force,
          });

    const shellRes = await fetch(
      `/api/student/${encodeURIComponent(studentId)}/details-bundle?${shellQuery}`,
      { credentials: "include", cache: "no-store", signal: options?.signal }
    );
    const shellData = await shellRes.json().catch(() => ({}));
    if (!shellRes.ok) {
      throw new Error(
        (shellData as { message?: string })?.message || "Failed to load student profile"
      );
    }
    if (!(shellData as { student?: unknown })?.student) {
      throw new Error("Invalid student details response");
    }

    const shell = parseShell(shellData);
    options?.onShellLoaded?.(toBundle(shell, emptyExtras(), cachedBreakdown ?? null));

    // Defer extras until shell is painted — reduces concurrent DB load on remote Postgres.
    const [extras, feeBreakdown] = await Promise.all([
      fetchExtras(studentId, options?.signal, options?.force),
      breakdownPromise,
    ]);
    if (feeBreakdown) {
      setFeeBreakdownCache(studentId, feeBreakdown);
      options?.onBreakdownLoaded?.(feeBreakdown);
    }

    const full = toBundle(shell, extras, feeBreakdown ?? cachedBreakdown ?? null);
    cacheBundle(studentId, full);
    options?.onExtrasLoaded?.(full);
    return full;
  })();

  bundleInflight.set(studentId, run);
  try {
    return await run;
  } finally {
    bundleInflight.delete(studentId);
  }
}
