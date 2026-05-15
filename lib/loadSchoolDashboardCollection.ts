export type SchoolDashboardCollectionPayload = {
  collectionDate: string;
  todayCollectionTotal: string;
  todayCollectionTotalRaw: number;
  todayCollectionByMethod: Array<{
    key: string;
    label: string;
    amount: number;
    formattedAmount: string;
    count: number;
  }>;
};

/** Lightweight fetch when only the collection date changes. */
export async function loadSchoolDashboardCollection(
  dateYmd: string,
  signal?: AbortSignal
): Promise<SchoolDashboardCollectionPayload> {
  const res = await fetch(
    `/api/school/dashboard/collection?date=${encodeURIComponent(dateYmd)}`,
    { credentials: "include", cache: "no-store", signal }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message || "Failed to load collection");
  }
  return data as SchoolDashboardCollectionPayload;
}
