import { apiGet } from "./http";

export type ClassListFullResponse = {
  message?: string;
  classes?: unknown[];
};

export function fetchClassList() {
  return apiGet<ClassListFullResponse>("/api/class/list", { cache: "no-store" });
}

export type ClassListLiteResponse = {
  classes?: { id: string; name?: string; section?: string | null }[];
};

/** `all: true` lists every class in the school, not just the caller's assigned ones. */
export function fetchClassListLite(opts?: { all?: boolean }) {
  return apiGet<ClassListLiteResponse>(
    opts?.all ? "/api/class/list?lite=1&all=1" : "/api/class/list?lite=1",
    { cache: "no-store" }
  );
}

export type ClassStudentsResponse = {
  students?: Array<{
    id: string;
    rollNo?: string | null;
    user?: { name?: string | null };
  }>;
};

export function fetchClassStudents(classId: string) {
  return apiGet<ClassStudentsResponse>(
    `/api/class/students?classId=${encodeURIComponent(classId)}`,
    { cache: "no-store" }
  );
}
