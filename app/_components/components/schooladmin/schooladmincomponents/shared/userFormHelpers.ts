import { Permission } from "@/app/_components/enums/permissions";
import type { IUser } from "@/app/_components/constants/addUserTable";
import type { UserFormData } from "./userFormTypes";

export function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const ddmmyyyy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${String(parseInt(m, 10)).padStart(2, "0")}-${String(parseInt(d, 10)).padStart(2, "0")}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** Aliases stored historically → canonical Permission keys used by toggles / sidebar */
const MARKS_FEATURE_ALIASES = new Set(["MARKS", "marks", "marks-view", "marks-entry"]);
const EXAMS_FEATURE_ALIASES = new Set(["EXAMS", "exams"]);

export function normalizeAllowedFeatures(features: string[]): string[] {
  const out = new Set<string>();
  for (const raw of features) {
    const f = String(raw || "").trim();
    if (!f) continue;
    if (MARKS_FEATURE_ALIASES.has(f) || MARKS_FEATURE_ALIASES.has(f.toLowerCase())) {
      out.add(Permission.MARKS);
      continue;
    }
    if (EXAMS_FEATURE_ALIASES.has(f) || EXAMS_FEATURE_ALIASES.has(f.toLowerCase())) {
      out.add(Permission.EXAMS);
      continue;
    }
    out.add(f);
  }
  return [...out];
}

export const AVAILABLE_FEATURES_FOR_TEACHERS: Array<{
  key: Permission;
  label: string;
  description?: string;
}> = [
  { key: Permission.DASHBOARD, label: "Dashboard" },
  // School Admin modules — same as ?tab=exams / ?tab=marks
  { key: Permission.EXAMS, label: "Exams", description: "School Admin → Exams" },
  { key: Permission.MARKS, label: "Marks", description: "School Admin → Marks" },
  { key: Permission.ADMISSION, label: "Admission" },
  { key: Permission.CLASSES, label: "Classes" },
  { key: Permission.HOMEWORK, label: "Homework" },
  { key: Permission.ATTENDANCE, label: "Attendance" },
  { key: Permission.WORKSHOPS, label: "Workshops & Events" },
  { key: Permission.NEWSFEED, label: "Newsfeed" },
  { key: Permission.CHAT, label: "Parent Chat" },
  { key: Permission.LEAVES, label: "Leave" },
  { key: Permission.PROFILE, label: "Profile" },
  { key: Permission.SETTINGS, label: "Settings" },
  { key: Permission.STUDENTS, label: "Students" },
  { key: Permission.FEES, label: "Fees" },
  { key: Permission.CERTIFICATES, label: "Certificates" },
  { key: Permission.STUDENT_DETAILS, label: "Student Details" },
  { key: Permission.TEACHERS, label: "Teachers" },
  { key: Permission.TEACHER_LEAVES, label: "Teacher Leaves" },
  { key: Permission.TEACHER_AUDIT, label: "Teacher Audit" },
];

export function formDataFromApi(userData: Record<string, unknown>): UserFormData {
  const joinDate = toDateInputValue(userData.joiningDate);
  const subjects = userData.subjects;
  return {
    name: String(userData.name || ""),
    email: String(userData.email || ""),
    role: (userData.role as UserFormData["role"]) || "TEACHER",
    designation: String(userData.designation || userData.subject || ""),
    password: "",
    confirmPassword: "",
    allowedFeatures: Array.isArray(userData.allowedFeatures)
      ? normalizeAllowedFeatures(userData.allowedFeatures as string[])
      : [],
    teacherId: String(userData.teacherId || ""),
    subjects: Array.isArray(subjects)
      ? subjects.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [],
    assignedClassIds: Array.isArray(userData.assignedClassIds)
      ? (userData.assignedClassIds as string[])
      : [],
    qualification: String(userData.qualification || ""),
    experience: String(userData.experience || ""),
    joiningDate: joinDate,
    teacherStatus: String(userData.teacherStatus || "Active"),
    mobile: String(userData.mobile || ""),
    address: String(userData.address || ""),
  };
}

export const EMPTY_FORM: UserFormData = {
  name: "",
  email: "",
  role: "TEACHER",
  designation: "",
  password: "",
  confirmPassword: "",
  allowedFeatures: [],
  teacherId: "",
  subjects: [],
  assignedClassIds: [],
  qualification: "",
  experience: "",
  joiningDate: "",
  teacherStatus: "Active",
  mobile: "",
  address: "",
};

/** Only fields available on the list row — never wipe teacher-specific state. */
export function listShellFields(user: IUser): Pick<
  UserFormData,
  "name" | "email" | "role" | "designation" | "allowedFeatures"
> {
  return {
    name: user.name || "",
    email: user.email || "",
    role: (user.role as UserFormData["role"]) || "TEACHER",
    designation: user.designation || "",
    allowedFeatures: normalizeAllowedFeatures(user.allowedFeatures || []),
  };
}
