import type { TeacherDashboardData } from "@/app/frontend/components/teacher/dashboard/dashboardComponents/types";
import type { ClassOption, HomeworkItem } from "@/app/frontend/components/teacher/homework/types";
import type { TeacherClass, StudentRow } from "@/app/frontend/components/teacher/classes/hooks/useTeacherClasses";
import { fetchAllStudents } from "@/lib/fetchAllStudents";
import {
  invalidateTeacherResource,
  loadTeacherResource,
  peekTeacherResource,
  setTeacherResource,
} from "@/lib/teacherFastTabCache";
import {
  loadCertificatesPage,
  loadEventsPage,
  loadExamsPage,
  loadNewsFeeds,
  loadTeacherAuditTeachers,
  loadTeacherLeavesPage,
  warmSchoolAdminFastTabs,
} from "@/lib/loadSchoolAdminFastTabs";
import { warmTeachersPage } from "@/lib/fetchTeachersPage";

const ns = {
  dashboard: "teacher-dashboard",
  homework: "teacher-homework",
  classes: "teacher-classes",
  myLeaves: "teacher-my-leaves",
  studentLeaves: "teacher-student-leaves",
  chat: "teacher-chat",
  attendanceClasses: "teacher-attendance-classes",
  examsList: "teacher-exams-list",
  marksClasses: "teacher-marks-classes",
  profile: "teacher-profile",
} as const;

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || fallback);
  }
  return data as T;
}

/* ---------- Dashboard ---------- */

export function peekTeacherDashboard() {
  return peekTeacherResource<TeacherDashboardData>(ns.dashboard);
}

export async function loadTeacherDashboard(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadTeacherResource<TeacherDashboardData>(
    ns.dashboard,
    "default",
    async () => {
      const res = await fetch("/api/teacher/dashboard", {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      });
      return jsonOrThrow<TeacherDashboardData>(res, "Failed to load dashboard");
    },
    options
  );
}

export function setTeacherDashboardCache(payload: TeacherDashboardData) {
  setTeacherResource(ns.dashboard, "default", payload);
}

/* ---------- Homework ---------- */

export type TeacherHomeworkPayload = {
  homeworks: HomeworkItem[];
  classes: ClassOption[];
};

export function peekTeacherHomework() {
  return peekTeacherResource<TeacherHomeworkPayload>(ns.homework);
}

export async function loadTeacherHomework(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadTeacherResource<TeacherHomeworkPayload>(
    ns.homework,
    "default",
    async () => {
      const [hwRes, classRes] = await Promise.all([
        fetch("/api/homework/list", { credentials: "include", cache: "no-store", signal: options?.signal }),
        fetch("/api/class/list?lite=1", { credentials: "include", cache: "no-store", signal: options?.signal }),
      ]);
      const [hwData, classData] = await Promise.all([
        hwRes.ok ? hwRes.json().catch(() => ({})) : Promise.resolve({}),
        classRes.ok ? classRes.json().catch(() => ({})) : Promise.resolve({}),
      ]);
      return {
        homeworks: Array.isArray(hwData.homeworks) ? (hwData.homeworks as HomeworkItem[]) : [],
        classes: Array.isArray(classData.classes) ? (classData.classes as ClassOption[]) : [],
      };
    },
    options
  );
}

export function setTeacherHomeworkCache(payload: TeacherHomeworkPayload) {
  setTeacherResource(ns.homework, "default", payload);
}

export function invalidateTeacherHomework() {
  invalidateTeacherResource(ns.homework);
}

/* ---------- Classes ---------- */

export type TeacherClassesPayload = {
  classes: TeacherClass[];
  students: StudentRow[];
};

export function peekTeacherClasses() {
  return peekTeacherResource<TeacherClassesPayload>(ns.classes);
}

export async function loadTeacherClasses(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadTeacherResource<TeacherClassesPayload>(
    ns.classes,
    "default",
    async () => {
      const [classRes, students] = await Promise.all([
        fetch("/api/class/list", { credentials: "include", cache: "no-store", signal: options?.signal }),
        fetchAllStudents<StudentRow>(undefined, { take: 100, maxPages: 50 }),
      ]);
      if (!classRes.ok) throw new Error("Failed to load classes.");
      const classData = await classRes.json().catch(() => ({}));
      return {
        classes: Array.isArray(classData?.classes) ? (classData.classes as TeacherClass[]) : [],
        students,
      };
    },
    options
  );
}

export function setTeacherClassesCache(payload: TeacherClassesPayload) {
  setTeacherResource(ns.classes, "default", payload);
}

export function invalidateTeacherClasses() {
  invalidateTeacherResource(ns.classes);
}

/* ---------- My leaves ---------- */

export type TeacherMyLeave = {
  id: string;
  leaveType: string;
  reason: string | null;
  fromDate: string;
  toDate: string;
  status: string;
  remarks: string | null;
  createdAt: string;
};

export function peekTeacherMyLeaves() {
  return peekTeacherResource<TeacherMyLeave[]>(ns.myLeaves);
}

export async function loadTeacherMyLeaves(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadTeacherResource<TeacherMyLeave[]>(
    ns.myLeaves,
    "default",
    async () => {
      const res = await fetch("/api/leaves/my", {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error((data as { message?: string })?.message || "Failed to load leaves");
      return Array.isArray(data) ? (data as TeacherMyLeave[]) : [];
    },
    options
  );
}

export function setTeacherMyLeavesCache(leaves: TeacherMyLeave[]) {
  setTeacherResource(ns.myLeaves, "default", leaves);
}

export function invalidateTeacherMyLeaves() {
  invalidateTeacherResource(ns.myLeaves);
}

/* ---------- Student leave approvals ---------- */

export type TeacherStudentLeave = {
  attachment?: unknown;
  id: string;
  leaveType: string;
  reason: string;
  fromDate: string;
  toDate: string;
  status: string;
  remarks: string | null;
  createdAt: string;
  student: {
    id: string;
    user: { id: string; name: string | null; email: string | null; photoUrl: string | null } | null;
    class: { id: string; name: string; section: string | null } | null;
  };
};

export type TeacherStudentLeavesPayload = {
  pendingLeaves: TeacherStudentLeave[];
  allLeaves: TeacherStudentLeave[];
};

export function peekTeacherStudentLeaves() {
  return peekTeacherResource<TeacherStudentLeavesPayload>(ns.studentLeaves);
}

export async function loadTeacherStudentLeaves(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadTeacherResource<TeacherStudentLeavesPayload>(
    ns.studentLeaves,
    "default",
    async () => {
      const [pendingRes, allRes] = await Promise.all([
        fetch("/api/student-leaves/pending", {
          credentials: "include",
          cache: "no-store",
          signal: options?.signal,
        }),
        fetch("/api/student-leaves/all", {
          credentials: "include",
          cache: "no-store",
          signal: options?.signal,
        }),
      ]);
      const [pendingData, allData] = await Promise.all([
        pendingRes.json().catch(() => []),
        allRes.json().catch(() => []),
      ]);
      return {
        pendingLeaves: Array.isArray(pendingData) ? (pendingData as TeacherStudentLeave[]) : [],
        allLeaves: Array.isArray(allData) ? (allData as TeacherStudentLeave[]) : [],
      };
    },
    options
  );
}

export function setTeacherStudentLeavesCache(payload: TeacherStudentLeavesPayload) {
  setTeacherResource(ns.studentLeaves, "default", payload);
}

export function invalidateTeacherStudentLeaves() {
  invalidateTeacherResource(ns.studentLeaves);
}

/* ---------- Parent chat ---------- */

export type TeacherChatAppointment = {
  id: string;
  status: string;
  note: string | null;
  student?: {
    fatherName?: string;
    user?: { name?: string; photoUrl?: string | null };
  } | null;
  messages?: Array<{ content: string }>;
};

export function peekTeacherChats() {
  return peekTeacherResource<TeacherChatAppointment[]>(ns.chat);
}

export async function loadTeacherChats(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadTeacherResource<TeacherChatAppointment[]>(
    ns.chat,
    "default",
    async () => {
      const res = await fetch("/api/communication/appointments", {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      });
      const data = await jsonOrThrow<{ appointments?: TeacherChatAppointment[] }>(
        res,
        "Failed to load chats"
      );
      return Array.isArray(data.appointments) ? data.appointments : [];
    },
    options
  );
}

export function setTeacherChatsCache(appointments: TeacherChatAppointment[]) {
  setTeacherResource(ns.chat, "default", appointments);
}

export function invalidateTeacherChats() {
  invalidateTeacherResource(ns.chat);
}

/* ---------- Attendance / Marks class list ---------- */

export type LiteClassOption = { id: string; name: string; section?: string | null };

export function peekTeacherAttendanceClasses() {
  return peekTeacherResource<LiteClassOption[]>(ns.attendanceClasses);
}

export async function loadTeacherAttendanceClasses(options?: {
  revalidate?: boolean;
  signal?: AbortSignal;
}) {
  return loadTeacherResource<LiteClassOption[]>(
    ns.attendanceClasses,
    "default",
    async () => {
      const res = await fetch("/api/class/list?lite=1", {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      });
      const data = await jsonOrThrow<{ classes?: LiteClassOption[] }>(res, "Failed to load classes");
      return Array.isArray(data.classes) ? data.classes : [];
    },
    options
  );
}

export function peekTeacherMarksClasses() {
  return peekTeacherResource<LiteClassOption[]>(ns.marksClasses);
}

export async function loadTeacherMarksClasses(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadTeacherResource<LiteClassOption[]>(
    ns.marksClasses,
    "default",
    async () => {
      const res = await fetch("/api/class/list?lite=1", {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      });
      const data = await jsonOrThrow<{ classes?: LiteClassOption[] }>(res, "Failed to load classes");
      return Array.isArray(data.classes) ? data.classes : [];
    },
    options
  );
}

/* ---------- Exams list (teacher flattened schedules) ---------- */

export function peekTeacherExamsList() {
  return peekTeacherResource<unknown[]>(ns.examsList);
}

export async function loadTeacherExamsList(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadTeacherResource<unknown[]>(
    ns.examsList,
    "default",
    async () => {
      const res = await fetch("/api/exams/terms", {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string })?.message || "Failed to load exams");
      if (Array.isArray((data as { exams?: unknown[] }).exams)) {
        return (data as { exams: unknown[] }).exams;
      }
      if (Array.isArray((data as { terms?: unknown[] }).terms)) {
        return (data as { terms: unknown[] }).terms;
      }
      return [];
    },
    options
  );
}

export function setTeacherExamsListCache(exams: unknown[]) {
  setTeacherResource(ns.examsList, "default", exams);
}

export function invalidateTeacherExamsList() {
  invalidateTeacherResource(ns.examsList);
}

/* ---------- Profile ---------- */

export type TeacherProfilePagePayload = {
  profile: {
    name: string;
    teacherId: string;
    subject: string;
    assignedClasses: string;
    qualification: string;
    experience: string;
    joiningDate: string;
    status: "Active" | "Inactive";
    email: string;
    phone: string;
    address: string;
    avatarUrl: string | null;
  };
  classes: Array<{ className: string; subject: string; students: number }>;
  quickStats: { totalClasses: number; totalStudents: number; workshopsConducted: number };
  userId: string;
};

function formatProfileDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB");
}

function mapClassLabel(name: string, section?: string | null) {
  if (!section) return name;
  return `${name}-${section}`;
}

export function peekTeacherProfile() {
  return peekTeacherResource<TeacherProfilePagePayload>(ns.profile);
}

export async function loadTeacherProfile(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadTeacherResource<TeacherProfilePagePayload>(
    ns.profile,
    "default",
    async () => {
      const res = await fetch("/api/user/me", {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      });
      const data = await jsonOrThrow<{
        user: {
          id: string;
          name: string | null;
          email: string | null;
          mobile: string | null;
          address: string | null;
          qualification: string | null;
          experience: string | null;
          photoUrl: string | null;
          teacherId: string | null;
          subject: string | null;
          createdAt: string;
          assignedClasses?: Array<{
            id: string;
            name: string;
            section: string | null;
            _count?: { students?: number };
          }>;
        };
      }>(res, "Failed to load profile");

      const user = data.user;
      const mappedClasses = (user.assignedClasses ?? []).map((item) => ({
        className: `Class ${mapClassLabel(item.name, item.section)}`,
        subject: user.subject ?? "",
        students: item._count?.students ?? 0,
      }));

      let workshopsConducted = 0;
      try {
        const eventsRes = await fetch(
          `/api/events/list?teacherId=${encodeURIComponent(user.id)}`,
          { credentials: "include", cache: "no-store", signal: options?.signal }
        );
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json().catch(() => ({}));
          const events = Array.isArray(eventsData?.events) ? eventsData.events : [];
          workshopsConducted = events.filter(
            (event: { type?: string | null }) => (event.type ?? "").toLowerCase() === "workshop"
          ).length;
        }
      } catch {
        workshopsConducted = 0;
      }

      const totalStudents = mappedClasses.reduce((sum, c) => sum + c.students, 0);

      return {
        userId: user.id,
        profile: {
          name: user.name ?? "",
          email: user.email ?? "",
          phone: user.mobile ?? "",
          address: user.address ?? "",
          qualification: user.qualification ?? "",
          experience: user.experience ?? "",
          avatarUrl: user.photoUrl?.trim() ? user.photoUrl : null,
          teacherId: user.teacherId ?? "",
          subject: user.subject ?? "",
          joiningDate: formatProfileDate(user.createdAt),
          status: "Active" as const,
          assignedClasses:
            mappedClasses.length > 0
              ? mappedClasses.map((c) => c.className.replace(/^Class\s/, "")).join(", ")
              : "",
        },
        classes: mappedClasses,
        quickStats: {
          totalClasses: mappedClasses.length,
          totalStudents,
          workshopsConducted,
        },
      };
    },
    options
  );
}

export function setTeacherProfileCache(payload: TeacherProfilePagePayload) {
  setTeacherResource(ns.profile, "default", payload);
}

export function invalidateTeacherProfile() {
  invalidateTeacherResource(ns.profile);
}

/* ---------- Warm ---------- */

export function warmTeacherFastTabs(schoolId?: string | null): void {
  void loadTeacherDashboard().catch(() => {});
  void loadTeacherHomework().catch(() => {});
  void loadTeacherClasses().catch(() => {});
  void loadTeacherMyLeaves().catch(() => {});
  void loadTeacherStudentLeaves().catch(() => {});
  void loadTeacherChats().catch(() => {});
  void loadTeacherAttendanceClasses().catch(() => {});
  void loadTeacherMarksClasses().catch(() => {});
  void loadTeacherExamsList().catch(() => {});
  void loadTeacherProfile().catch(() => {});
  void loadEventsPage().catch(() => {});
  void loadNewsFeeds().catch(() => {});
  void loadCertificatesPage().catch(() => {});
  void loadTeacherLeavesPage().catch(() => {});
  void loadExamsPage().catch(() => {});
  warmSchoolAdminFastTabs();
  if (schoolId) warmTeachersPage(schoolId);
}

export function warmTeacherTab(tab: string, schoolId?: string | null): void {
  switch (tab) {
    case "dashboard":
      void loadTeacherDashboard().catch(() => {});
      break;
    case "homework":
      void loadTeacherHomework().catch(() => {});
      break;
    case "classes":
      void loadTeacherClasses().catch(() => {});
      break;
    case "leaves":
      void loadTeacherMyLeaves().catch(() => {});
      void loadTeacherStudentLeaves().catch(() => {});
      break;
    case "chat":
      void loadTeacherChats().catch(() => {});
      break;
    case "attendance":
      void loadTeacherAttendanceClasses().catch(() => {});
      break;
    case "timetable":
      void loadTeacherAttendanceClasses().catch(() => {});
      break;
    case "marks":
      void loadTeacherMarksClasses().catch(() => {});
      break;
    case "exams":
      void loadTeacherExamsList().catch(() => {});
      void loadExamsPage().catch(() => {});
      break;
    case "workshops":
      void loadEventsPage().catch(() => {});
      break;
    case "newsfeed":
      void loadNewsFeeds().catch(() => {});
      break;
    case "certificates":
      void loadCertificatesPage().catch(() => {});
      break;
    case "students":
      void loadTeacherClasses().catch(() => {});
      void loadTeacherAttendanceClasses().catch(() => {});
      break;
    case "profile":
      void loadTeacherProfile().catch(() => {});
      break;
    case "teacher-leaves":
      void loadTeacherLeavesPage().catch(() => {});
      break;
    case "teacher-audit":
      void loadTeacherAuditTeachers("", "").catch(() => {});
      break;
    case "teachers":
      if (schoolId) warmTeachersPage(schoolId);
      break;
    default:
      break;
  }
}
