import { apiGet } from "./http";

export type StudentSearchRow = {
  id: string;
  user?: { name?: string };
  admissionNumber?: string;
  rollNo?: string | null;
  penNumber?: string | null;
  apaarId?: string | null;
  fatherName?: string;
  motherName?: string;
  status?: string;
  class?: { id: string; name: string; section: string | null };
};

export type StudentSearchResponse = {
  students?: StudentSearchRow[];
};

export function searchStudents(
  params: { take: string; search: string; q: string; status?: "Active" | "Inactive" },
  signal?: AbortSignal
) {
  const query = new URLSearchParams({ take: params.take, search: params.search, q: params.q });
  if (params.status) query.set("status", params.status);
  return apiGet<StudentSearchResponse>(`/api/student/list?${query.toString()}`, {
    cache: "no-store",
    signal,
  });
}
