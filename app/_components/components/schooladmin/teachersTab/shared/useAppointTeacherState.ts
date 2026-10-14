import { useState, useEffect, useMemo, useCallback } from "react";
import {
  fetchAppointTeacherData,
  invalidateTeachersPageCache,
} from "@/lib/teacher/fetchTeachersPage";
import {
  peekAppointTeacherData,
  peekAppointTeacherDataAny,
} from "@/lib/teacher/teachersPageClientCache";
import { DEFAULT_AVATAR, type AppointmentRow, type ClassItem, type TeacherItem } from "./appointTeacherTypes";

export function useAppointTeacherState({
  schoolId,
  onRosterChange,
}: {
  schoolId?: string | null;
  onRosterChange?: () => void;
}) {
  const initialAppoint = peekAppointTeacherDataAny();
  const [classes, setClasses] = useState<ClassItem[]>(() =>
    initialAppoint ? (initialAppoint.classes as ClassItem[]) : []
  );
  const [teachers, setTeachers] = useState<TeacherItem[]>(() =>
    initialAppoint ? (initialAppoint.teachers as TeacherItem[]) : []
  );
  const [loading, setLoading] = useState(() => !initialAppoint);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");

  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [editingClassId, setEditingClassId] = useState<string | null>(null);

  const applyPayload = useCallback((payload: { classes: unknown[]; teachers: TeacherItem[] }) => {
    setClasses(payload.classes as ClassItem[]);
    setTeachers(payload.teachers);
  }, []);

  const reloadAppointData = useCallback(
    async (revalidate = true) => {
      if (!schoolId) return;
      const payload = await fetchAppointTeacherData(schoolId, { revalidate });
      applyPayload(payload);
    },
    [schoolId, applyPayload]
  );

  useEffect(() => {
    if (!schoolId) return;

    const cached = peekAppointTeacherData(schoolId) ?? peekAppointTeacherDataAny();
    if (cached) {
      applyPayload(cached);
      setLoading(false);
      void reloadAppointData(true);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    void fetchAppointTeacherData(schoolId, {
      revalidate: true,
      signal: controller.signal,
    })
      .then(applyPayload)
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to load appoint teacher data:", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [schoolId, applyPayload, reloadAppointData]);

  useEffect(() => {
    if (!schoolId) return;

    const refresh = () => {
      if (schoolId) invalidateTeachersPageCache(schoolId);
      void reloadAppointData(true);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "timelly:profile-updated") refresh();
    };
    window.addEventListener("teacher-profile-updated", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("teacher-profile-updated", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [schoolId, reloadAppointData]);

  /* ================= DATA ================= */
  const teachersById = useMemo(
    () =>
      new Map(
        teachers.map((teacher) => [teacher.id, teacher] as const)
      ),
    [teachers]
  );

  const appointments: AppointmentRow[] = useMemo(() => {
    return classes
      .filter((c) => c.teacherId && c.teacher)
      .map((c) => {
        const photoFromClass = c.teacher?.photoUrl || null;
        const photoFromTeacherList = c.teacherId
          ? teachersById.get(c.teacherId)?.photoUrl || null
          : null;

        return {
          classId: c.id,
          className: [c.name, c.section]
            .filter(Boolean)
            .join(c.section ? " - " : ""),
          teacherName: c.teacher!.name || "Teacher",
          teacherCode:
            c.teacher?.teacherId || c.teacher!.id.slice(0, 6).toUpperCase(),
          teacherEmail: c.teacher!.email || "-",
          avatar: photoFromClass || photoFromTeacherList || DEFAULT_AVATAR,
        };
      });
  }, [classes, teachersById]);

  const classOptions = classes.map((c) => ({
    value: c.id,
    label: [c.name, c.section]
      .filter(Boolean)
      .join(c.section ? " - " : ""),
  }));

  const teacherOptions = teachers.map((t) => ({
    value: t.id,
    label: t.name || "Teacher",
  }));

  /* ================= ACTIONS ================= */

  const handleAssign = async () => {
    if (!selectedClassId || !selectedTeacherId || !schoolId) return;

    setAssigning(true);

    try {
      const res = await fetch(`/api/class/${selectedClassId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ teacherId: selectedTeacherId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setSelectedClassId("");
      setSelectedTeacherId("");
      setEditingClassId(null);

      invalidateTeachersPageCache(schoolId);
      await reloadAppointData(true);
      onRosterChange?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed.");
    } finally {
      setAssigning(false);
    }
  };

  const handleEdit = (item: AppointmentRow) => {
    setSelectedClassId(item.classId);

    const teacher = teachers.find(
      (t) =>
        (t.teacherId || t.id.slice(0, 6).toUpperCase()) ===
        item.teacherCode
    );

    if (teacher) setSelectedTeacherId(teacher.id);

    setEditingClassId(item.classId);

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRemove = async (classId: string) => {
    if (!schoolId) return;
    if (!confirm("Do you really want to remove this class teacher? This action cannot be undone.")) return;

    setRemovingId(classId);

    await fetch(`/api/class/${classId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ teacherId: null }),
    });

    invalidateTeachersPageCache(schoolId);
    await reloadAppointData(true);
    onRosterChange?.();

    setRemovingId(null);
  };

  const cancelEdit = () => {
    setEditingClassId(null);
    setSelectedClassId("");
    setSelectedTeacherId("");
  };

  return {
    classes,
    loading,
    selectedClassId,
    setSelectedClassId,
    selectedTeacherId,
    setSelectedTeacherId,
    assigning,
    removingId,
    editingClassId,
    appointments,
    classOptions,
    teacherOptions,
    handleAssign,
    handleEdit,
    handleRemove,
    cancelEdit,
  };
}
