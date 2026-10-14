type StudentListResponse<T> = {
  students?: T[];
  items?: T[];
  nextCursor?: string | null;
};

/**
 * Fetches the complete student list in a single request (`all=1`). The old cursor loop made
 * sequential round-trips of ~100 rows each (~3s apiece against the remote DB), so a 700-student
 * school waited 20s+ before anything rendered.
 */
export async function fetchAllStudents<T = unknown>(
  init?: RequestInit,
  _options?: { take?: number; maxPages?: number }
): Promise<T[]> {
  const res = await fetch("/api/student/list?all=1&take=10000", init);
  const data = (await res.json().catch(() => ({}))) as StudentListResponse<T> & { message?: string };
  if (!res.ok) {
    throw new Error(data.message || "Failed to fetch students");
  }
  return Array.isArray(data.students) ? data.students : Array.isArray(data.items) ? data.items : [];
}
