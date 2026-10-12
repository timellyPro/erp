import { useCallback, useEffect, useMemo, useState } from "react";
import type { TimetablePayload } from "../../../timetable/TimetableGrid";
import {
  blankEntry,
  classLabel,
  DAYS,
  editableEntriesFromTimetable,
  setTimetableSetupCache,
  timetableByClassCache,
  timetableSetupCache,
  type ClassOption,
  type EditableEntry,
  type TeacherOption,
} from "./timetableTypes";
import {
  fetchAllTimetables,
  fetchClassListLite,
  fetchTeacherList,
  fetchTimetableForClass,
  saveTimetable,
} from "@/lib/api/timetable";

export function useTimetableState() {
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
      const [classResult, teacherResult, timetableResult] = await Promise.all([
        fetchClassListLite(),
        fetchTeacherList(),
        fetchAllTimetables(),
      ]);
      const classData = classResult.data;
      const teacherData = teacherResult.data;
      const timetableData = timetableResult.data;
      if (!classResult.ok) throw new Error(classData.message || "Failed to load classes");

      const loadedClasses = Array.isArray(classData.classes) ? classData.classes : [];
      const loadedTeachers = Array.isArray(teacherData.teachers) ? teacherData.teachers : [];
      setTimetableSetupCache({ classes: loadedClasses, teachers: loadedTeachers });
      if (timetableResult.ok && Array.isArray(timetableData.timetables)) {
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

  const applyTimetable = useCallback((timetable: TimetablePayload | null) => {
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
      const { ok, data } = await fetchTimetableForClass(classId);
      if (!ok) throw new Error(data.message || "Failed to load timetable");
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
      const { ok, data } = await saveTimetable({
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
      });
      if (!ok) throw new Error(data.message || "Failed to save timetable");
      setSuccess("Timetable saved successfully");
      timetableByClassCache.set(selectedClassId, data.timetable ?? null);
      applyTimetable(data.timetable ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save timetable");
    } finally {
      setSaving(false);
    }
  };

  return {
    classes,
    teachers,
    selectedClassId,
    setSelectedClassId,
    selectedDay,
    setSelectedDay,
    entries,
    loading,
    loadingTimetable,
    saving,
    error,
    success,
    selectedClass,
    selectedDayLabel,
    previewTimetable,
    selectedDayEntries,
    entryCountByDay,
    addEntry,
    updateEntry,
    removeEntry,
    handleSave,
  };
}
