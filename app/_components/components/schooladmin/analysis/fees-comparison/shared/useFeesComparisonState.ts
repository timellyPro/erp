import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  loadFeesComparisonReport,
  peekFeesComparisonReport,
  type FeesComparisonQuery,
} from "@/lib/fees/loadFeesComparisonReport";
import { todayYmd, type ComparisonReport } from "./feesComparisonTypes";

export function useFeesComparisonState() {
  const { data: session } = useSession();
  const schoolId = session?.user?.schoolId ?? null;
  const today = useMemo(() => todayYmd(), []);
  const [rangeAFrom, setRangeAFrom] = useState(today);
  const [rangeATo, setRangeATo] = useState(today);
  const [rangeBFrom, setRangeBFrom] = useState(today);
  const [rangeBTo, setRangeBTo] = useState(today);
  const defaultQuery = useMemo<FeesComparisonQuery>(
    () => ({ rangeAFrom: today, rangeATo: today, rangeBFrom: today, rangeBTo: today }),
    [today]
  );
  const [report, setReport] = useState<ComparisonReport | null>(() =>
    peekFeesComparisonReport(null, defaultQuery)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentQuery = useMemo<FeesComparisonQuery>(
    () => ({ rangeAFrom, rangeATo, rangeBFrom, rangeBTo }),
    [rangeAFrom, rangeATo, rangeBFrom, rangeBTo]
  );

  const loadReport = useCallback(async (options?: { revalidate?: boolean; signal?: AbortSignal }) => {
    const cached = !options?.revalidate ? peekFeesComparisonReport(schoolId, currentQuery) : null;
    if (cached) {
      setReport(cached);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await loadFeesComparisonReport(schoolId, currentQuery, {
        revalidate: options?.revalidate,
        signal: options?.signal,
      });
      setReport(result.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load comparison");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [currentQuery, schoolId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadReport({ signal: controller.signal });
    return () => controller.abort();
  }, [loadReport]);

  const hasRows = (report?.rows.length ?? 0) > 0;

  return {
    rangeAFrom,
    setRangeAFrom,
    rangeATo,
    setRangeATo,
    rangeBFrom,
    setRangeBFrom,
    rangeBTo,
    setRangeBTo,
    report,
    loading,
    error,
    loadReport,
    hasRows,
  };
}
