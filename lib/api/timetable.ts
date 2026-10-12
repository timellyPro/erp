import { z } from "zod";
import { apiGet, apiPost, validateApiResponse } from "./http";
import type { ClassOption, TeacherOption } from "@/app/_components/components/schooladmin/shared/timetable/timetableTypes";
import type { TimetablePayload } from "@/app/_components/components/timetable/TimetableGrid";

// These three payload shapes (ClassOption, TeacherOption, TimetablePayload)
// are owned by their component/feature types and already reasonably typed
// there; the schemas below check the top-level envelope shape rather than
// re-modeling every nested optional field, so a genuinely malformed
// response is still caught without risking false-positive warnings from a
// hand-mirrored schema drifting out of sync with those types.
export type ClassListResponse = {
  message?: string;
  classes?: ClassOption[];
};
const ClassListResponseSchema = z.object({
  message: z.string().optional(),
  classes: z.array(z.unknown()).optional(),
});

export type TeacherListResponse = {
  message?: string;
  teachers?: TeacherOption[];
};
const TeacherListResponseSchema = z.object({
  message: z.string().optional(),
  teachers: z.array(z.unknown()).optional(),
});

export type AllTimetablesResponse = {
  message?: string;
  timetables?: TimetablePayload[];
};
const AllTimetablesResponseSchema = z.object({
  message: z.string().optional(),
  timetables: z.array(z.unknown()).optional(),
});

export type TimetableResponse = {
  message?: string;
  timetable?: TimetablePayload;
};
const TimetableResponseSchema = z.object({
  message: z.string().optional(),
  timetable: z.unknown().optional(),
});

export async function fetchClassListLite() {
  const result = await apiGet<ClassListResponse>("/api/class/list?lite=1");
  return {
    ...result,
    data: validateApiResponse(ClassListResponseSchema, result.data, "fetchClassListLite") as ClassListResponse,
  };
}

export async function fetchTeacherList() {
  const result = await apiGet<TeacherListResponse>("/api/teacher/list");
  return {
    ...result,
    data: validateApiResponse(TeacherListResponseSchema, result.data, "fetchTeacherList") as TeacherListResponse,
  };
}

export async function fetchAllTimetables() {
  const result = await apiGet<AllTimetablesResponse>("/api/timetable?all=1");
  return {
    ...result,
    data: validateApiResponse(AllTimetablesResponseSchema, result.data, "fetchAllTimetables") as AllTimetablesResponse,
  };
}

export async function fetchMyTimetable() {
  const result = await apiGet<TimetableResponse>("/api/timetable", { cache: "no-store" });
  return {
    ...result,
    data: validateApiResponse(TimetableResponseSchema, result.data, "fetchMyTimetable") as TimetableResponse,
  };
}

export async function fetchTimetableForClass(classId: string) {
  const result = await apiGet<TimetableResponse>(`/api/timetable?classId=${encodeURIComponent(classId)}`, {
    cache: "no-store",
  });
  return {
    ...result,
    data: validateApiResponse(TimetableResponseSchema, result.data, "fetchTimetableForClass") as TimetableResponse,
  };
}

export async function saveTimetable(payload: {
  classId: string;
  title: string;
  notes: string;
  entries: unknown[];
}) {
  const result = await apiPost<TimetableResponse>("/api/timetable", payload);
  return {
    ...result,
    data: validateApiResponse(TimetableResponseSchema, result.data, "saveTimetable") as TimetableResponse,
  };
}
