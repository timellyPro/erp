"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../common/PageHeader";
import TimellyLoader from "../../common/TimellyLoader";
import TimetableGrid, { TimetablePayload } from "../../timetable/TimetableGrid";
import {
  loadTeacherAttendanceClasses,
  peekTeacherAttendanceClasses,
} from "@/lib/loadTeacherFastTabs";

type ClassOption = {
  id: string;
  name?: string | null;
  section?: string | null;
};

const classLabel = (classRow?: ClassOption | null) =>
  classRow
    ? `${classRow.name ?? "Class"}${classRow.section ? ` - ${classRow.section}` : ""}`
    : "Select class";

export default function TeacherTimetableTab() {
  const initialClasses = peekTeacherAttendanceClasses();
  const [classes, setClasses] = useState<ClassOption[]>(() => initialClasses ?? []);
  const [selectedClassId, setSelectedClassId] = useState(() => initialClasses?.[0]?.id ?? "");
  const [timetable, setTimetable] = useState<TimetablePayload>(null);
  const [loading, setLoading] = useState(() => !initialClasses?.length);
  const [loadingTimetable, setLoadingTimetable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClass = useMemo(
    () => classes.find((classRow) => classRow.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  );

  const loadClasses = useCallback(async (revalidate = false) => {
    if (!revalidate) {
      const cached = peekTeacherAttendanceClasses();
      if (cached?.length) {
        setClasses(cached);
        setLoading(false);
        setSelectedClassId((prev) => prev || cached[0]?.id || "");
        void loadClasses(true);
        return;
      }
    }

    setLoading((prev) => (classes.length === 0 ? true : prev));
    setError(null);
    try {
      const loadedClasses = await loadTeacherAttendanceClasses({ revalidate: true });
      setClasses(loadedClasses);
      setSelectedClassId((prev) => prev || loadedClasses[0]?.id || "");
    } catch (err) {
      if (classes.length === 0) {
        setError(err instanceof Error ? err.message : "Failed to load classes");
      }
    } finally {
      setLoading(false);
    }
  }, [classes.length]);

  const loadTimetable = useCallback(async (classId: string) => {
    if (!classId) return;
    setLoadingTimetable(true);
    setError(null);
    try {
      const res = await fetch(`/api/timetable?classId=${encodeURIComponent(classId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to load timetable");
      setTimetable(data.timetable ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timetable");
      setTimetable(null);
    } finally {
      setLoadingTimetable(false);
    }
  }, []);

  useEffect(() => {
    void loadClasses(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedClassId) void loadTimetable(selectedClassId);
  }, [loadTimetable, selectedClassId]);

  if (loading && classes.length === 0) {
    return (
      <TimellyLoader title="Loading timetable" steps={["Classes", "Periods", "Schedule"]} />
    );
  }

  return (
    <div className="min-h-screen space-y-6 text-white">
      <PageHeader title="Timetable" subtitle="View class-wise periods, breaks, teachers, and rooms." />

      <section className="rounded-3xl border border-white/10 bg-white/4 p-5">
        <label className="block max-w-sm space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Class</span>
          <select
            value={selectedClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-lime-300/50"
          >
            {classes.map((classRow) => (
              <option key={classRow.id} value={classRow.id} className="bg-slate-950">
                {classLabel(classRow)}
              </option>
            ))}
          </select>
        </label>
        {selectedClass ? (
          <p className="mt-3 text-sm text-white/55">Showing timetable for {classLabel(selectedClass)}.</p>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {loadingTimetable ? (
        <TimellyLoader compact title="Loading schedule" steps={["Periods", "Teachers", "Rooms"]} />
      ) : (
        <TimetableGrid
          timetable={timetable}
          emptyMessage="No timetable has been published for this class yet."
        />
      )}
    </div>
  );
}
