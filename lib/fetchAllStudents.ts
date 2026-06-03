type StudentListResponse<T> = {
  students?: T[];
  items?: T[];
  nextCursor?: string | null;
};

/**
 * Cursor-paginated fetch for complete student lists without one huge query.
 */
export async function fetchAllStudents<T = unknown>(
  init?: RequestInit,
  options?: { take?: number; maxPages?: number }
): Promise<T[]> {
  const take = Math.min(200, Math.max(25, options?.take ?? 100));
  const maxPages = Math.max(1, options?.maxPages ?? 30);
  const out: T[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ take: String(take) });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/student/list?${params.toString()}`, init);
    const data = (await res.json().catch(() => ({}))) as StudentListResponse<T> & { message?: string };
    if (!res.ok) {
      throw new Error(data.message || "Failed to fetch students");
    }
    const items = Array.isArray(data.students)
      ? data.students
      : Array.isArray(data.items)
        ? data.items
        : [];
    out.push(...items);
    cursor = typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null;
    if (!cursor || items.length === 0) break;
  }

  return out;
}
