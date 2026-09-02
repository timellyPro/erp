import type { TeacherRow } from "@/app/frontend/components/schooladmin/teachersTab/TeachersList";
import {
  getLastTeachersSchoolId,
  invalidateTeachersPageCache,
  peekAppointTeacherData,
  peekAppointTeacherDataAny,
  peekTeacherAttendance,
  peekTeacherAttendanceAny,
  peekTeachersList,
  peekTeachersListAny,
  setAppointTeacherDataCache,
  setTeacherAttendanceCache,
  setTeachersListCache,
  type TeacherApiRow,
  type TeacherAttendanceEntry,
} from "@/lib/teachersPageClientCache";

export {
  getLastTeachersSchoolId,
  invalidateTeachersPageCache,
  peekAppointTeacherData,
  peekAppointTeacherDataAny,
  peekTeacherAttendance,
  peekTeacherAttendanceAny,
  peekTeachersList,
  peekTeachersListAny,
  setTeacherAttendanceCache,
};
export type { TeacherApiRow };

const DEFAULT_AVATAR = "https://randomuser.me/api/portraits/lego/1.jpg";

const listInflight = new Map<string, Promise<TeacherApiRow[]>>();
const attendanceInflight = new Map<string, Promise<TeacherAttendanceEntry[]>>();
const appointInflight = new Map<string, Promise<{ classes: unknown[]; teachers: TeacherApiRow[] }>>();

export function mapApiTeachersToRows(teachers: TeacherApiRow[]): TeacherRow[] {
  return teachers.map((t) => ({
    id: t.id,
    teacherId: t.teacherId || t.id.slice(0, 6).toUpperCase(),
    name: t.name || "Teacher",
    avatar: t.photoUrl || DEFAULT_AVATAR,
    subject: t.subject || "-",
    attendance: 0,
    phone: t.mobile || "-",
    status: "Active" as const,
  }));
}

export async function fetchTeachersList(
  schoolId: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<TeacherApiRow[]> {
  if (!options?.revalidate) {
    const cached = peekTeachersList(schoolId);
    if (cached) return cached;
  }

  const running = listInflight.get(schoolId);
  if (running) return running;

  const run = (async () => {
    const res = await fetch("/api/teacher/list", {
      credentials: "include",
      cache: "no-store",
      signal: options?.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { message?: string }).message || "Failed to load teachers");
    }
    const teachers = (Array.isArray(data.teachers) ? data.teachers : []) as TeacherApiRow[];
    setTeachersListCache(schoolId, teachers);
    return teachers;
  })();

  listInflight.set(schoolId, run);
  try {
    return await run;
  } finally {
    listInflight.delete(schoolId);
  }
}

export async function fetchTeacherAttendance(
  schoolId: string,
  date: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<TeacherAttendanceEntry[]> {
  const key = `${schoolId}:${date}`;
  if (!options?.revalidate) {
    const cached = peekTeacherAttendance(schoolId, date);
    if (cached) return cached;
  }

  const running = attendanceInflight.get(key);
  if (running) return running;

  const run = (async () => {
    const res = await fetch(`/api/teacher/attendance?date=${encodeURIComponent(date)}`, {
      credentials: "include",
      cache: "no-store",
      signal: options?.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { message?: string }).message || "Failed to load attendance");
    }
    const attendances = (Array.isArray(data.attendances) ? data.attendances : []) as TeacherAttendanceEntry[];
    setTeacherAttendanceCache(schoolId, date, attendances);
    return attendances;
  })();

  attendanceInflight.set(key, run);
  try {
    return await run;
  } finally {
    attendanceInflight.delete(key);
  }
}

export async function fetchAppointTeacherData(
  schoolId: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<{ classes: unknown[]; teachers: TeacherApiRow[] }> {
  if (!options?.revalidate) {
    const cached = peekAppointTeacherData(schoolId);
    if (cached) return cached;
  }

  const running = appointInflight.get(schoolId);
  if (running) return running;

  const run = (async () => {
    const [classRes, teacherRes] = await Promise.all([
      fetch("/api/class/list?lite=1", {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      }),
      fetch("/api/teacher/list", {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      }),
    ]);

    const classData = await classRes.json().catch(() => ({}));
    const teacherData = await teacherRes.json().catch(() => ({}));

    const payload = {
      classes: Array.isArray(classData.classes) ? classData.classes : [],
      teachers: (Array.isArray(teacherData.teachers) ? teacherData.teachers : []) as TeacherApiRow[],
    };

    setAppointTeacherDataCache(schoolId, payload);
    setTeachersListCache(schoolId, payload.teachers);
    return payload;
  })();

  appointInflight.set(schoolId, run);
  try {
    return await run;
  } finally {
    appointInflight.delete(schoolId);
  }
}

/** Prefetch teachers list + today's attendance + appoint data when navigating to Teachers tab. */
export function warmTeachersPage(schoolId: string | null | undefined): void {
  if (!schoolId) return;
  const today = new Date().toISOString().slice(0, 10);
  // Always kick network in background so tab opens with fresh data after instant cache paint.
  void fetchTeachersList(schoolId, { revalidate: Boolean(peekTeachersList(schoolId)) }).catch(() => {});
  void fetchTeacherAttendance(schoolId, today, {
    revalidate: Boolean(peekTeacherAttendance(schoolId, today)),
  }).catch(() => {});
  void fetchAppointTeacherData(schoolId, {
    revalidate: Boolean(peekAppointTeacherData(schoolId)),
  }).catch(() => {});
}
