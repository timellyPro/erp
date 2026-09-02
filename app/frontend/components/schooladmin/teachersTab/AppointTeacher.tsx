"use client";

import { GraduationCap, UserPlus, Trash2, Pencil } from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  fetchAppointTeacherData,
  invalidateTeachersPageCache,
} from "@/lib/fetchTeachersPage";
import {
  peekAppointTeacherData,
  peekAppointTeacherDataAny,
} from "@/lib/teachersPageClientCache";
import TimellyLoader from "../../common/TimellyLoader";

const DEFAULT_AVATAR =
  "https://randomuser.me/api/portraits/lego/1.jpg";

/* ================= TYPES ================= */
type ClassItem = {
  id: string;
  name: string;
  section: string | null;
  teacherId: string | null;
  teacher?: {
    id: string;
    name: string | null;
    email: string | null;
    teacherId?: string | null;
    photoUrl?: string | null;
  } | null;
};

type TeacherItem = {
  id: string;
  name: string | null;
  email: string | null;
  teacherId: string | null;
  photoUrl: string | null;
};

type AppointmentRow = {
  classId: string;
  className: string;
  teacherName: string;
  teacherCode: string;
  teacherEmail: string;
  avatar: string;
};

type AppointTeacherProps = {
  schoolId?: string | null;
  /** After assign/remove class teacher, refresh the main teachers list / stats. */
  onRosterChange?: () => void;
};

/* ================= COMPONENT ================= */
export default function AppointTeacher({ schoolId, onRosterChange }: AppointTeacherProps) {
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

  /* ================= UI ================= */

  return (
    <div className="w-full max-w-6xl mx-auto bg-white/5 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/10 text-white overflow-hidden">
      {/* HEADER */}
      <div className="p-4 sm:p-5 md:p-6">
        <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
          <GraduationCap className="text-lime-400 w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
          Appoint Class Teacher
        </h2>
        <p className="text-xs sm:text-sm text-white/60 mt-0.5 sm:mt-1">
          Assign one class teacher per class.
        </p>
      </div>

      {/* FORM */}
      <div className="border-t border-white/10 p-4 sm:p-5 md:p-6 bg-[#0F172A]/50">
        {loading && classes.length === 0 ? (
          <TimellyLoader
            compact
            bare
            title="Loading appointments"
            steps={["Classes", "Teachers", "Assignments"]}
          />
        ) : (
          <div className="flex flex-col gap-3 sm:gap-4">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3"
            >
              <option value="" className="bg-gray-900 text-white">-- Select Class --</option>
              {classOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-gray-900 text-white" >
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="flex-1 border border-white/10 rounded-xl px-4 py-3  bg-black/20"
            >
              <option value="" className="bg-gray-900 text-white">-- Select Teacher --</option>
              {teacherOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-gray-900 text-white">
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              onClick={handleAssign}
              disabled={!selectedClassId || !selectedTeacherId || assigning}
              className="w-full sm:w-auto px-6 py-3 rounded-lg sm:rounded-xl font-semibold flex items-center justify-center gap-2 bg-lime-500 text-black hover:bg-lime-400 disabled:opacity-40 text-sm sm:text-base"
            >
              <UserPlus size={18} />
              {assigning
                ? editingClassId
                  ? "Updating..."
                  : "Assigning..."
                : editingClassId
                ? "Update"
                : "Assign"}
            </button>
          </div>
        )}

        {editingClassId && (
          <button
            onClick={() => {
              setEditingClassId(null);
              setSelectedClassId("");
              setSelectedTeacherId("");
            }}
            className="mt-3 text-xs underline text-white/60"
          >
            Cancel edit
          </button>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[600px] p-4 sm:p-6">
        <table className="w-full text-sm">
          <thead className="text-gray-400">
            <tr>
              <th className="text-left py-2">Class</th>
              <th className="text-left py-2">Teacher</th>
              <th className="text-left py-2">Email</th>
              <th className="text-right py-2">Actions</th>
            </tr>
          </thead>

          <tbody>
            {appointments.map((item) => (
              <tr key={item.classId} className="border-t border-white/10">
                <td className="py-3">{item.className}</td>

                <td className="py-3 flex items-center gap-2">
                  <img
                    src={item.avatar}
                    className="w-7 h-7 rounded-full"
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_AVATAR;
                    }}
                  />
                  {item.teacherName}
                </td>

                <td className="py-3 text-white/60">
                  {item.teacherEmail}
                </td>

                <td className="py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <button onClick={() => handleEdit(item)}>
                      <Pencil
                        size={16}
                        className="text-lime-400 hover:text-lime-300"
                      />
                    </button>

                    <button
                      disabled={removingId === item.classId}
                      onClick={() => handleRemove(item.classId)}
                    >
                      <Trash2 size={16} className="text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="md:hidden border-t border-white/10 p-4 space-y-3">
        {appointments.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-white/50 text-sm">
            No class teachers appointed yet. Select a class and teacher above to assign.
          </div>
        ) : (
        appointments.map((item) => (
          <div
            key={item.classId}
            className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              <img
                src={item.avatar}
                className="h-9 w-9 rounded-full"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_AVATAR;
                }}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">
                  {item.className}
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {item.teacherEmail}
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm text-white/80">
              {item.teacherName}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button onClick={() => handleEdit(item)}>
                <Pencil
                  size={16}
                  className="text-lime-400 hover:text-lime-300"
                />
              </button>

              <button
                disabled={removingId === item.classId}
                onClick={() => handleRemove(item.classId)}
              >
                <Trash2 size={16} className="text-red-400" />
              </button>
            </div>
          </div>
        ))
        )}
      </div>
    </div>
  );
}
