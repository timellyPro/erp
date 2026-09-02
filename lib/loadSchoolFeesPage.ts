import type { Class, ExtraFee, FeeRecord, FeeStructure, FeeSummary, Student } from "@/app/frontend/components/schooladmin/fees/types";
import {
  feesPageReady,
  feesRequirementsForSection,
  type FeesSection,
} from "@/lib/feesPageRequirements";
import { fetchAllStudents } from "@/lib/fetchAllStudents";
import {
  invalidateSchoolFeesPageCache,
  peekLastFeesSchoolId,
  peekSchoolFeesSnapshot,
  setSchoolFeesClassesCache,
  setSchoolFeesExtraFeesCache,
  setSchoolFeesFeeRecordsCache,
  setSchoolFeesStatsCache,
  setSchoolFeesStructuresCache,
  setSchoolFeesStudentsCache,
  type SchoolFeesPageSnapshot,
} from "@/lib/schoolFeesPageClientCache";
import { fetchFeesTransactions } from "@/lib/feesTransactionsCache";
import { readStudentListCacheLegacy, writeStudentListCacheLegacy } from "@/lib/studentListSessionCache";

export type { FeesSection, SchoolFeesPageSnapshot };
export { invalidateSchoolFeesPageCache, peekLastFeesSchoolId, peekSchoolFeesSnapshot };

export type LoadSchoolFeesPageResult = SchoolFeesPageSnapshot & { fromCache: boolean };

const inflight = new Map<string, Promise<LoadSchoolFeesPageResult>>();

async function fetchSummary(statsOnly: boolean, signal?: AbortSignal) {
  const q = statsOnly ? "statsOnly=1" : "take=20";
  const res = await fetch(`/api/fees/summary?${q}`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || "Failed to load fees summary");
  return {
    stats: (data.stats as FeeSummary | null) ?? null,
    fees: (Array.isArray(data.fees) ? data.fees : []) as FeeRecord[],
  };
}

async function fetchFeeRecords(signal?: AbortSignal): Promise<FeeRecord[]> {
  const res = await fetch("/api/fees/records?take=5000", {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || "Failed to load fee records");
  return (Array.isArray(data.fees) ? data.fees : []) as FeeRecord[];
}

async function fetchClasses(signal?: AbortSignal): Promise<Class[]> {
  const res = await fetch("/api/class/list?lite=1", {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || "Failed to load classes");
  return (Array.isArray(data.classes) ? data.classes : []) as Class[];
}

async function fetchStructures(signal?: AbortSignal): Promise<FeeStructure[]> {
  const res = await fetch("/api/fees/structure", {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || "Failed to load fee structure");
  return (Array.isArray(data.structures) ? data.structures : []) as FeeStructure[];
}

async function fetchExtraFees(signal?: AbortSignal): Promise<ExtraFee[]> {
  const res = await fetch("/api/fees/extra", {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || "Failed to load extra fees");
  return Array.isArray(data.extraFees) ? data.extraFees : [];
}

async function fetchStudents(signal?: AbortSignal): Promise<Student[]> {
  const cached = readStudentListCacheLegacy<Student>();
  if (cached?.length) return cached;
  const students = await fetchAllStudents<Student>(
    { credentials: "include", cache: "no-store", signal },
    { take: 100, maxPages: 50 }
  );
  if (students.length) writeStudentListCacheLegacy(students);
  return students;
}

function mergeSnapshot(
  base: SchoolFeesPageSnapshot,
  patch: Partial<SchoolFeesPageSnapshot>
): SchoolFeesPageSnapshot {
  return {
    stats: patch.stats !== undefined ? patch.stats : base.stats,
    fees: patch.fees !== undefined ? patch.fees : base.fees,
    feeRecords: patch.feeRecords !== undefined ? patch.feeRecords : base.feeRecords,
    classes: patch.classes !== undefined ? patch.classes : base.classes,
    students: patch.students !== undefined ? patch.students : base.students,
    structures: patch.structures !== undefined ? patch.structures : base.structures,
    extraFees: patch.extraFees !== undefined ? patch.extraFees : base.extraFees,
  };
}

export function peekSchoolFeesPageForSection(
  schoolId: string | null | undefined,
  section?: FeesSection
): SchoolFeesPageSnapshot | null {
  const sid = schoolId ?? peekLastFeesSchoolId();
  if (!sid) return null;
  const snap = peekSchoolFeesSnapshot(sid);
  const req = feesRequirementsForSection(section);
  const probe = {
    stats: snap.stats,
    feeRecords: snap.feeRecords,
    classes: snap.classes,
    students: snap.students,
    structures: snap.structures,
    extraFees: snap.extraFees,
  };
  if (!feesPageReady(req, probe)) return null;
  return snap;
}

export async function loadSchoolFeesPage(
  section: FeesSection | undefined,
  options?: {
    schoolId?: string | null;
    signal?: AbortSignal;
    revalidate?: boolean;
  }
): Promise<LoadSchoolFeesPageResult> {
  const schoolId = options?.schoolId ?? peekLastFeesSchoolId();
  const req = feesRequirementsForSection(section);
  const key = `${schoolId ?? "anon"}:${section ?? "overview"}:${options?.revalidate ? "r" : "c"}`;

  if (!options?.revalidate && schoolId) {
    const cached = peekSchoolFeesPageForSection(schoolId, section);
    if (cached) return { ...cached, fromCache: true };
  }

  const running = inflight.get(key);
  if (running) return running;

  const run = (async (): Promise<LoadSchoolFeesPageResult> => {
    const base: SchoolFeesPageSnapshot = schoolId
      ? peekSchoolFeesSnapshot(schoolId)
      : {
          stats: null,
          fees: [],
          feeRecords: null,
          classes: null,
          students: null,
          structures: null,
          extraFees: null,
        };

    const blocking: Promise<void>[] = [];
    let snap = { ...base };

    if (req.summary) {
      blocking.push(
        fetchSummary(req.statsOnly, options?.signal).then(({ stats, fees }) => {
          snap = mergeSnapshot(snap, { stats, fees });
          if (schoolId) setSchoolFeesStatsCache(schoolId, stats, fees);
        })
      );
    }

    if (req.feeRecords) {
      blocking.push(
        fetchFeeRecords(options?.signal).then((feeRecords) => {
          snap = mergeSnapshot(snap, { feeRecords });
          if (schoolId) setSchoolFeesFeeRecordsCache(schoolId, feeRecords);
        })
      );
    }

    if (req.classes) {
      blocking.push(
        fetchClasses(options?.signal).then((classes) => {
          snap = mergeSnapshot(snap, { classes });
          if (schoolId) setSchoolFeesClassesCache(schoolId, classes);
        })
      );
    }

    if (req.structures) {
      blocking.push(
        fetchStructures(options?.signal).then((structures) => {
          snap = mergeSnapshot(snap, { structures });
          if (schoolId) setSchoolFeesStructuresCache(schoolId, structures);
        })
      );
    }

    if (req.extraFees) {
      blocking.push(
        fetchExtraFees(options?.signal).then((extraFees) => {
          snap = mergeSnapshot(snap, { extraFees });
          if (schoolId) setSchoolFeesExtraFeesCache(schoolId, extraFees);
        })
      );
    }

    if (req.students) {
      const cachedStudents =
        readStudentListCacheLegacy<Student>() ??
        (snap.students?.length ? snap.students : null);
      if (cachedStudents?.length) {
        snap = mergeSnapshot(snap, { students: cachedStudents });
        if (schoolId) setSchoolFeesStudentsCache(schoolId, cachedStudents);
        void fetchStudents(options?.signal)
          .then((students) => {
            if (schoolId) setSchoolFeesStudentsCache(schoolId, students);
          })
          .catch(() => {});
      } else {
        blocking.push(
          fetchStudents(options?.signal).then((students) => {
            snap = mergeSnapshot(snap, { students });
            if (schoolId) setSchoolFeesStudentsCache(schoolId, students);
          })
        );
      }
    }

    await Promise.all(blocking);
    return { ...snap, fromCache: false };
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

const warmedSchools = new Set<string>();

/** Warm shared fees data in the background (all sub-pages). */
export function warmSchoolFeesPage(schoolId: string | null | undefined): void {
  if (!schoolId || warmedSchools.has(schoolId)) return;
  warmedSchools.add(schoolId);

  void fetchClasses()
    .then((classes) => setSchoolFeesClassesCache(schoolId, classes))
    .catch(() => warmedSchools.delete(schoolId));
  void fetchStructures()
    .then((structures) => setSchoolFeesStructuresCache(schoolId, structures))
    .catch(() => {});
  void fetchExtraFees()
    .then((extraFees) => setSchoolFeesExtraFeesCache(schoolId, extraFees))
    .catch(() => {});
  void fetchFeeRecords()
    .then((feeRecords) => setSchoolFeesFeeRecordsCache(schoolId, feeRecords))
    .catch(() => {});

  const cachedStudents = readStudentListCacheLegacy<Student>();
  if (cachedStudents?.length) {
    setSchoolFeesStudentsCache(schoolId, cachedStudents);
    void fetchStudents()
      .then((students) => setSchoolFeesStudentsCache(schoolId, students))
      .catch(() => {});
  } else {
    void fetchStudents()
      .then((students) => setSchoolFeesStudentsCache(schoolId, students))
      .catch(() => {});
  }

  void fetchSummary(true).then(({ stats, fees }) => setSchoolFeesStatsCache(schoolId, stats, fees)).catch(() => {});
  void fetchFeesTransactions(schoolId, { revalidate: true }).catch(() => {});
}

/** Prefetch data for a fees sub-route (nav hover / before navigation). */
export function prefetchFeesSection(
  schoolId: string | null | undefined,
  section: FeesSection | string
): void {
  if (!schoolId) return;
  const slug = section as FeesSection;
  void loadSchoolFeesPage(slug, { schoolId, revalidate: true }).catch(() => {});
}
