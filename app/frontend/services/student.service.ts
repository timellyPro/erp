
import axios from "axios";
import { api } from "./api.service";
import { IStudent } from "../interfaces/student";
import { IUpdateStudentPayload } from "../constants/student";

export const getStudents = (classId?: string) =>
  api(`/api/students${classId ? `?classId=${classId}` : ""}`);

export const addStudent = (payload: any) =>
  api("/api/student/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    // Student create runs a large Prisma transaction; allow extra time vs default.
    timeoutMs: 90000,
  });

export const uploadStudentsCSV = (file: File, classId: string) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("classId", classId);

  return fetch("/api/student/bulk-upload", {
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

export const updateStudent = (studentId: string, payload: {
  name?: string;
  fatherName?: string;
  motherName?: string;
  occupation?: string;
  classId?: string;
  rollNo?: string;
  phoneNo?: string;
  email?: string;
  address?: string;
  gender?: string;
  residencyType?: string;
  previousSchool?: string;
  applicationFee?: number | null;
  admissionFee?: number | null;
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



