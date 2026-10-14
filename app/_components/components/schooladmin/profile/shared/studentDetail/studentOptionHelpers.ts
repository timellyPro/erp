import type { StudentDetail, StudentOption } from "../types";

/** List cache may hold fees-page rows (class object) or profile rows (classDisplay). */
export function normalizeStudentOption(raw: {
  id: string;
  name?: string;
  admissionNumber?: string;
  parentName?: string;
  fatherName?: string;
  rollNo?: string | null;
  penNumber?: string | null;
  apaarId?: string | null;
  classDisplay?: string;
  classId?: string;
  section?: string | null;
  user?: { name?: string | null };
  class?: { id: string; name: string; section: string | null } | null;
  status?: string;
}): StudentOption {
  const classDisplay =
    raw.classDisplay?.trim() ||
    (raw.class
      ? `${raw.class.name}${raw.class.section ? `-${raw.class.section}` : ""}`
      : "-");
  const dash = classDisplay.indexOf("-");
  return {
    id: raw.id,
    name: raw.name?.trim() || raw.user?.name?.trim() || "Unknown",
    admissionNumber: raw.admissionNumber ?? "",
    parentName: raw.parentName?.trim() || raw.fatherName?.trim() || "-",
    classDisplay,
    classId: raw.classId ?? raw.class?.id ?? "",
    section: raw.section ?? (dash > 0 ? classDisplay.slice(dash + 1) : raw.class?.section ?? null),
    status: raw.status ?? "Active",
    rollNo: raw.rollNo ?? null,
    penNumber: raw.penNumber ?? null,
    apaarId: raw.apaarId ?? null,
  };
}

export function patchDetailShell(prev: StudentDetail | null, shell: StudentDetail): StudentDetail {
  if (!shell?.student) return prev ?? shell;
  const sameStudent = prev?.student.id === shell.student.id;
  return {
    student: shell.student,
    fee: shell.fee,
    payments: sameStudent ? (prev?.payments ?? []) : [],
    attendanceTrends: sameStudent ? (prev?.attendanceTrends ?? []) : [],
    academicPerformance: sameStudent ? (prev?.academicPerformance ?? []) : [],
    certificates: sameStudent ? (prev?.certificates ?? []) : [],
  };
}

/** Instant UI while API loads — uses data already on the student list. */
export function buildPlaceholderDetail(st: StudentOption): StudentDetail {
  const opt = normalizeStudentOption(st);
  const dash = opt.classDisplay.indexOf("-");
  const className = dash > 0 ? opt.classDisplay.slice(0, dash) : opt.classDisplay;
  const section = dash > 0 ? opt.classDisplay.slice(dash + 1) : opt.section;
  const parent = opt.parentName === "-" ? "" : opt.parentName;
  return {
    student: {
      id: opt.id,
      name: opt.name,
      schoolName: "",
      admissionNumber: opt.admissionNumber,
      email: "",
      photoUrl: null,
      rollNo: "",
      age: null,
      address: "",
      phone: "",
      fatherName: parent,
      motherName: "",
      fatherPhone: "",
      motherPhone: "",
      residencyType: "Day Scholar",
      gender: "",
      applicationFee: null,
      admissionFee: null,
      status: opt.status ?? "Active",
      class: opt.classId
        ? {
            id: opt.classId,
            name: className,
            section,
            displayName: opt.classDisplay,
          }
        : null,
    },
    fee: null,
    payments: [],
    attendanceTrends: [],
    academicPerformance: [],
    certificates: [],
  };
}

export function buildPlaceholderById(studentId: string): StudentDetail {
  return {
    student: {
      id: studentId,
      name: "Loading…",
      schoolName: "",
      admissionNumber: "",
      email: "",
      photoUrl: null,
      rollNo: "",
      age: null,
      address: "",
      phone: "",
      fatherName: "",
      motherName: "",
      fatherPhone: "",
      motherPhone: "",
      residencyType: "Day Scholar",
      gender: "",
      applicationFee: null,
      admissionFee: null,
      class: null,
    },
    fee: null,
    payments: [],
    attendanceTrends: [],
    academicPerformance: [],
    certificates: [],
  };
}
