;
import axios from "axios";
import { api } from "./api.service";
import { IStudent } from "../interfaces/student";
import { IUpdateStudentPayload } from "../constants/student";

export const getStudents = (classId?: string) =>
  api(`/api/students${classId ? `?classId=${classId}` : ""}`);

/** Returns the raw Response on success and failure so callers can map field errors (do not use `api()` here — it throws on 4xx). */
export const addStudent = (payload: unknown) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  return fetch("/api/student/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
};

export const uploadStudentsCSV = (file: File, classId: string) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("classId", classId);

  return fetch("/api/students/upload", {
    method: "POST",
    body: formData,
  }).then(res => res.json());
};

export const assignStudentsToClass = (studentId: string, classId: string) =>
  api("/api/student/assign-class", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId, classId }),
  });

export const bulkAssignStudentsToClass = (studentIds: string[], classId: string) =>
  api("/api/student/bulk-assign-class", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentIds, classId }),
  });

export const updateStudent = (studentId: string, payload: {
  name?: string;
  fatherName?: string;
  motherName?: string;
  occupation?: string;
  classId?: string;
  dob?: string;
  aadhaarNo?: string;
  rollNo?: string;
  penNumber?: string;
  apaarId?: string;
  phoneNo?: string;
  email?: string;
  address?: string;
  gender?: string;
  residencyType?: string;
  parentAadharNo?: string;
  parentWhatsapp?: string;
  bankAccountNo?: string;
  officeAddress?: string;
  houseNo?: string;
  street?: string;
  city?: string;
  town?: string;
  state?: string;
  pinCode?: string;
  nationality?: string;
  languagesAtHome?: string;
  caste?: string;
  religion?: string;
  emergencyFatherNo?: string;
  emergencyMotherNo?: string;
  emergencyGuardianNo?: string;
  previousSchool?: string;
  applicationFee?: number | null;
  admissionFee?: number | null;
  status?: string;
}) =>
  fetch(`/api/student/${studentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

export const deleteStudent = (studentId: string) =>
  fetch(`/api/student/${studentId}`, {
    method: "DELETE",
    credentials: "include",
  });


export const studentApi = {
  getByAdmissionNo: (admissionNo: string, academicYear?: string) =>
    axios.get("/api/school/student/by-admissionNo", {
      params: { admissionNo, academicYear },
    }),


  updateByAdmissionNo: (
    admissionNo: string,
    updates: IUpdateStudentPayload
  ) =>
    axios.patch<{ student: IStudent }>(
      "/api/school/student/by-admissionNo",
      { admissionNo, updates }
    ),
};




