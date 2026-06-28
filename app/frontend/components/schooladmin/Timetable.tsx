"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, Save, Trash2 } from "lucide-react";
import PageHeader from "../common/PageHeader";
import TimellyLoader from "../common/TimellyLoader";
import TimetableGrid, { TimetableEntry, TimetablePayload } from "../timetable/TimetableGrid";

type ClassOption = {
  id: string;
  name?: string | null;
  section?: string | null;
};

type TeacherOption = {
  id: string;
  name?: string | null;
  subject?: string | null;
};

type EditableEntry = Omit<TimetableEntry, "id" | "teacher"> & {
  clientId: string;
  teacher?: { id: string; name?: string | null; subject?: string | null } | null;
};

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const makeClientId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const blankEntry = (dayOfWeek = 1, slotOrder = 0): EditableEntry => ({
  clientId: makeClientId(),
  dayOfWeek,
  dayLabel: DAYS.find((day) => day.value === dayOfWeek)?.label ?? "Monday",
  slotOrder,
  slotType: "PERIOD",
  title: "",
  subject: "",
  startTime: "09:00",
  endTime: "09:45",
  room: "",
  notes: "",
  teacherId: "",
  teacher: null,
});

const classLabel = (classRow?: ClassOption | null) =>
  classRow ? `${classRow.name ?? "Class"}${classRow.section ? ` - ${classRow.section}` : ""}` : "Select class";

let timetableSetupCache: { classes: ClassOption[]; teachers: TeacherOption[] } | null = null;
const timetableByClassCache = new Map<string, TimetablePayload>();

function editableEntriesFromTimetable(timetable: TimetablePayload): EditableEntry[] {
  return (timetable?.entries ?? []).map((entry) => ({
    ...entry,
    clientId: entry.id ?? makeClientId(),
    teacherId: entry.teacher?.id ?? entry.teacherId ?? "",
    teacher: entry.teacher ?? null,
    subject: entry.subject ?? "",
    room: entry.room ?? "",
    notes: entry.notes ?? "",
  }));
}

export default function SchoolAdminTimetableTab() {
  const cachedSetup = timetableSetupCache;
  const [classes, setClasses] = useState<ClassOption[]>(cachedSetup?.classes ?? []);
  const [teachers, setTeachers] = useState<TeacherOption[]>(cachedSetup?.teachers ?? []);
  const [selectedClassId, setSelectedClassId] = useState(cachedSetup?.classes[0]?.id ?? "");
  const [selectedDay, setSelectedDay] = useState(1);
  const [title, setTitle] = useState("Weekly Timetable");
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<EditableEntry[]>([]);
  const [loading, setLoading] = useState(!cachedSetup);
  const [loadingTimetable, setLoadingTimetable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedClass = useMemo(
    () => classes.find((classRow) => classRow.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  );
  const selectedDayLabel = DAYS.find((day) => day.value === selectedDay)?.label ?? "Monday";
  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher])), [teachers]);

  const loadOptions = useCallback(async () => {
    if (timetableSetupCache) {
      setClasses(timetableSetupCache.classes);
      setTeachers(timetableSetupCache.teachers);
      setSelectedClassId((prev) => prev || timetableSetupCache?.classes[0]?.id || "");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [classRes, teacherRes, timetableRes] = await Promise.all([
        fetch("/api/class/list?lite=1", { credentials: "include" }),
        fetch("/api/teacher/list", { credentials: "include" }),
        fetch("/api/timetable?all=1", { credentials: "include" }),
      ]);
      const [classData, teacherData, timetableData] = await Promise.all([
        classRes.json().catch(() => ({})),
        teacherRes.json().catch(() => ({})),
        timetableRes.json().catch(() => ({})),
      ]);
      if (!classRes.ok) throw new Error(classData.message || "Failed to load classes");

      const loadedClasses = Array.isArray(classData.classes) ? classData.classes : [];
      const loadedTeachers = Array.isArray(teacherData.teachers) ? teacherData.teachers : [];
      timetableSetupCache = { classes: loadedClasses, teachers: loadedTeachers };
      if (timetableRes.ok && Array.isArray(timetableData.timetables)) {
        for (const timetable of timetableData.timetables as TimetablePayload[]) {
          if (timetable?.class?.id) {
            timetableByClassCache.set(timetable.class.id, timetable);
          }
        }
        for (const classRow of loadedClasses) {
          if (!timetableByClassCache.has(classRow.id)) {
            timetableByClassCache.set(classRow.id, null);
          }
        }
      }
      setClasses(loadedClasses);
      setTeachers(loadedTeachers);
      setSelectedClassId((prev) => prev || loadedClasses[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timetable setup");
    } finally {
      setLoading(false);
    }
  }, []);

  const applyTimetable = useCallback((timetable: TimetablePayload) => {
    setTitle(timetable?.title || "Weekly Timetable");
    setNotes(timetable?.notes || "");
    setEntries(editableEntriesFromTimetable(timetable));
  }, []);

  const loadTimetable = useCallback(async (classId: string) => {
    if (!classId) return;
    if (timetableByClassCache.has(classId)) {
      applyTimetable(timetableByClassCache.get(classId) ?? null);
      return;
    }

    setLoadingTimetable(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/timetable?classId=${encodeURIComponent(classId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to load timetable");
      const timetable = data.timetable as TimetablePayload;
      timetableByClassCache.set(classId, timetable);
      applyTimetable(timetable);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timetable");
      setEntries([]);
    } finally {
      setLoadingTimetable(false);
    }
  }, [applyTimetable]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (selectedClassId) void loadTimetable(selectedClassId);
  }, [loadTimetable, selectedClassId]);

  const previewTimetable: TimetablePayload = useMemo(
    () => ({
      title,
      notes,
      class: selectedClass,
      entries: entries
        .filter((entry) => entry.title.trim() && entry.startTime && entry.endTime)
        .map((entry, index) => ({
          ...entry,
          slotOrder: index,
          subject: entry.slotType === "BREAK" ? null : entry.subject,
          room: entry.room || classLabel(selectedClass),
          teacher: teacherById.get(entry.teacherId ?? "") ?? entry.teacher ?? null,
        })),
    }),
    [entries, notes, selectedClass, teacherById, title]
  );

  const selectedDayEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.dayOfWeek === selectedDay)
        .sort((a, b) => a.slotOrder - b.slotOrder || a.startTime.localeCompare(b.startTime)),
    [entries, selectedDay]
  );
  const entryCountByDay = useMemo(() => {
    const counts = new Map<number, number>();
    for (const entry of entries) {
      counts.set(entry.dayOfWeek, (counts.get(entry.dayOfWeek) ?? 0) + 1);
    }
    return counts;
  }, [entries]);

  const addEntry = (dayOfWeek?: number) => {
    setEntries((prev) => {
      const targetDay = dayOfWeek ?? selectedDay;
      const nextOrder = prev.filter((entry) => entry.dayOfWeek === targetDay).length;
      return [...prev, blankEntry(targetDay, nextOrder)];
    });
  };

  const updateEntry = (clientId: string, patch: Partial<EditableEntry>) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.clientId !== clientId) return entry;
        const next = { ...entry, ...patch };
        if (patch.slotType === "BREAK") {
          next.subject = "";
        }
        if (patch.dayOfWeek !== undefined) {
          next.dayLabel = DAYS.find((day) => day.value === Number(patch.dayOfWeek))?.label ?? next.dayLabel;
        }
        return next;
      })
    );
  };

  const removeEntry = (clientId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.clientId !== clientId));
  };

  const handleSave = async () => {
    if (!selectedClassId) {
      setError("Select a class first");
      return;
    }
    const validEntries = entries.filter((entry) => entry.title.trim() && entry.startTime && entry.endTime);
    if (validEntries.length === 0) {
      setError("Add at least one period or break");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          classId: selectedClassId,
          title,
          notes,
          entries: validEntries.map(({ clientId: _clientId, teacher: _teacher, ...entry }, index) => ({
            ...entry,
            slotOrder: index,
            subject: entry.slotType === "BREAK" ? null : entry.subject,
            room: entry.room || classLabel(selectedClass),
            teacherId: entry.teacherId || null,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to save timetable");
      setSuccess("Timetable saved successfully");
      timetableByClassCache.set(selectedClassId, data.timetable ?? null);
      applyTimetable(data.timetable ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save timetable");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <TimellyLoader
        title="Loading timetable"
        steps={["Classes", "Teachers", "Schedules"]}
      />
    );
  }

  return (
    <div className="min-h-screen space-y-6 text-white">
      <PageHeader
        title="Timetable"
        subtitle="Select a class, choose a day, then customize that day's periods and breaks in the grid."
      />

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
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Select Day</h3>
          <p className="text-sm text-white/55">
            Choose the day you want to customize for {classLabel(selectedClass)}.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {DAYS.map((day) => {
            const count = entryCountByDay.get(day.value) ?? 0;
            const isActive = selectedDay === day.value;
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => setSelectedDay(day.value)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  isActive
                    ? "border-lime-300 bg-lime-300/15 text-lime-100"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                <span className="block text-sm font-semibold">{day.label}</span>
                <span className="text-xs text-white/45">{count} row{count === 1 ? "" : "s"}</span>
              </button>
            );
          })}
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-lime-300/25 bg-lime-400/10 p-4 text-sm text-lime-100">{success}</div> : null}
      {loadingTimetable ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
          Loading selected class timetable...
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <CalendarDays className="h-5 w-5 text-lime-300" />
              {selectedDayLabel} Grid
            </h3>
            <p className="text-sm text-white/55">Customize periods and breaks for the selected day.</p>
          </div>
          <button
            type="button"
            onClick={() => addEntry()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-lime-400 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-300"
          >
            <Plus className="h-4 w-4" />
            Add Row
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10">
          {selectedDayEntries.length === 0 ? (
            <div className="border border-dashed border-white/15 p-8 text-center text-white/55">
              No periods added for {selectedDayLabel}. Start with Add Row.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/45">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Type</th>
                    <th className="px-3 py-3 font-semibold">Period / Break</th>
                    <th className="px-3 py-3 font-semibold">Subject</th>
                    <th className="px-3 py-3 font-semibold">Start</th>
                    <th className="px-3 py-3 font-semibold">End</th>
                    <th className="px-3 py-3 font-semibold">Teacher</th>
                    <th className="px-3 py-3 font-semibold">Class</th>
                    <th className="px-3 py-3 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {selectedDayEntries.map((entry) => (
                    <tr key={entry.clientId} className="bg-white/3">
                      <td className="px-3 py-3">
                        <select
                          value={entry.slotType}
                          onChange={(event) => updateEntry(entry.clientId, { slotType: event.target.value })}
                          className="w-full min-w-24 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                        >
                          <option value="PERIOD" className="bg-slate-950">Period</option>
                          <option value="BREAK" className="bg-slate-950">Break</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={entry.title}
                          onChange={(event) => updateEntry(entry.clientId, { title: event.target.value })}
                          className="w-full min-w-36 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                          placeholder={entry.slotType === "BREAK" ? "Lunch Break" : "Maths Period"}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={entry.subject ?? ""}
                          onChange={(event) => updateEntry(entry.clientId, { subject: event.target.value })}
                          disabled={entry.slotType === "BREAK"}
                          className="w-full min-w-32 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                          placeholder={entry.slotType === "BREAK" ? "No subject for break" : "Subject"}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="time"
                          value={entry.startTime}
                          onChange={(event) => updateEntry(entry.clientId, { startTime: event.target.value })}
                          className="w-full min-w-28 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="time"
                          value={entry.endTime}
                          onChange={(event) => updateEntry(entry.clientId, { endTime: event.target.value })}
                          className="w-full min-w-28 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={entry.teacherId ?? ""}
                          onChange={(event) => updateEntry(entry.clientId, { teacherId: event.target.value })}
                          className="w-full min-w-36 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                        >
                          <option value="" className="bg-slate-950">No teacher</option>
                          {teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id} className="bg-slate-950">
                              {teacher.name ?? teacher.id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block min-w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
                          {classLabel(selectedClass)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeEntry(entry.clientId)}
                          className="inline-flex items-center justify-center rounded-xl border border-red-400/20 px-3 py-2 text-red-200 hover:bg-red-500/10"
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !selectedClassId}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-lime-400 px-5 py-3 text-sm font-semibold text-black hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Timetable"}
          </button>
        </div>
      </section>

      <TimetableGrid timetable={previewTimetable} emptyMessage="Add valid rows to preview the timetable." />
    </div>
  );
}
