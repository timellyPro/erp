import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";
import type { StudentDetailsTabExtras, StudentDetailsTabPayload } from "@/lib/buildStudentDetailsTabPayload";
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

const BUNDLE_TTL_MS = 30 * 60 * 1000;

function parseShell(data: unknown): StudentDetailsTabPayload {
  if (!(data as { student?: unknown })?.student) {
    throw new Error("Invalid student details response");
  }
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

export function peekStudentDetailsFast(studentId: string): StudentDetailsFastBundle | null {
  const entry = bundleMemory.get(studentId);
  if (entry && Date.now() < entry.expiresAt) return entry.value;
  return null;
}

export function invalidateStudentDetailsFast(studentId?: string) {
  if (studentId) {
    bundleMemory.delete(studentId);
    bundleInflight.delete(studentId);
    invalidateFeeBreakdownCache(studentId);
    return;
  }
  bundleMemory.clear();
  bundleInflight.clear();
  invalidateFeeBreakdownCache();
}

/**
 * One HTTP round-trip for profile + fee breakdown; extras in background.
 */
export async function fetchStudentDetailsFast(
  studentId: string,
  options?: {
    signal?: AbortSignal;
    onShellLoaded?: (bundle: StudentDetailsFastBundle) => void;
    onBreakdownLoaded?: (breakdown: AdminStudentFeeBreakdownResult) => void;
  }
): Promise<StudentDetailsFastBundle> {
  const mem = bundleMemory.get(studentId);
  if (mem && Date.now() < mem.expiresAt) {
    return mem.value;
  }

  const running = bundleInflight.get(studentId);
  if (running) return running;

  const run = (async (): Promise<StudentDetailsFastBundle> => {
    const cachedBreakdown = getFeeBreakdownCached(studentId);
    if (cachedBreakdown) options?.onBreakdownLoaded?.(cachedBreakdown);

    const [shellRes, extrasRes] = await Promise.all([
      fetch(
        `/api/student/${encodeURIComponent(studentId)}/details-bundle?shell=1&breakdown=1`,
        { credentials: "include", cache: "no-store", signal: options?.signal }
      ),
      fetch(
        `/api/student/${encodeURIComponent(studentId)}/details-bundle?extras=1`,
        { credentials: "include", cache: "no-store", signal: options?.signal }
      ),
    ]);

    const shellData = await shellRes.json().catch(() => ({}));
    if (!shellRes.ok) {
      throw new Error(
        (shellData as { message?: string })?.message || "Failed to load student profile"
      );
    }

    const shell = parseShell(shellData);
    const extras = extrasRes.ok
      ? parseExtras(await extrasRes.json().catch(() => ({})))
      : parseExtras({});

    let feeBreakdown =
      (shellData as { feeBreakdown?: AdminStudentFeeBreakdownResult | null }).feeBreakdown ??
      cachedBreakdown ??
      null;

    if (!feeBreakdown) {
      feeBreakdown = await fetchFeeBreakdownFast(studentId, { signal: options?.signal });
    } else {
      setFeeBreakdownCache(studentId, feeBreakdown);
    }

    if (feeBreakdown) options?.onBreakdownLoaded?.(feeBreakdown);

    const partial: StudentDetailsFastBundle = { ...shell, ...extras, feeBreakdown };
    options?.onShellLoaded?.(partial);

    const bundle: StudentDetailsFastBundle = { ...shell, ...extras, feeBreakdown };
    bundleMemory.set(studentId, { value: bundle, expiresAt: Date.now() + BUNDLE_TTL_MS });
    return bundle;
  })();

  bundleInflight.set(studentId, run);
  try {
    return await run;
  } finally {
    bundleInflight.delete(studentId);
  }
}
