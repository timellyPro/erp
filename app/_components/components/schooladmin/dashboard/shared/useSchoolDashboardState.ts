import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { todayYmdLocal } from "@/lib/school/schoolDashboardCollection";
import {
  loadSchoolDashboardCollectionHeads,
  loadSchoolDashboardCollectionSummary,
  peekSchoolDashboardCollectionHeads,
  setSchoolDashboardCollectionHeadsCached,
  warmSchoolDashboardCollectionHeads,
} from "@/lib/school/loadSchoolDashboardCollection";
import {
  fetchSchoolDashboard,
  fetchSchoolDashboardFast,
  peekSchoolDashboard,
  peekSchoolDashboardAny,
  type SchoolDashboardPayload,
} from "@/lib/school/loadSchoolDashboard";
import {
  dashboardCacheKey,
  setSchoolDashboardCached,
} from "@/lib/school/schoolDashboardClientCache";

export function useSchoolDashboardState() {
  const today = todayYmdLocal();
  const initialCached = peekSchoolDashboardAny(today);
  const initialHeads =
    initialCached?.todayCollectionByHead ?? peekSchoolDashboardCollectionHeads(today);
  const [data, setData] = useState<SchoolDashboardPayload | null>(() =>
    initialCached
      ? {
          ...initialCached,
          ...(initialHeads ? { todayCollectionByHead: initialHeads } : {}),
        }
      : null
  );
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [selectedCollectionFrom, setSelectedCollectionFrom] = useState(() => todayYmdLocal());
  const [selectedCollectionTo, setSelectedCollectionTo] = useState(() => todayYmdLocal());
  const selectedCollectionRangeKey = useMemo(
    () => `${selectedCollectionFrom}:${selectedCollectionTo}`,
    [selectedCollectionFrom, selectedCollectionTo]
  );
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [headsLoading, setHeadsLoading] = useState(() => !initialHeads);
  const lastFetchedSummaryDateRef = useRef<string | null>(null);
  const lastFetchedHeadsDateRef = useRef<string | null>(
    initialHeads ? `${today}:${today}` : null
  );
  const collectionAbortRef = useRef<AbortController | null>(null);
  const headsAbortRef = useRef<AbortController | null>(null);
  const { data: session, status: sessionStatus } = useSession();
  const userName = useMemo(() => {
    const n = session?.user?.name?.trim();
    return n ? (n.split(" ")[0] ?? "School") : "School";
  }, [session?.user?.name]);

  const schoolId = session?.user?.schoolId ?? null;

  const payloadCollectionRangeKey = useCallback((payload: SchoolDashboardPayload) => {
    const from = payload.collectionFrom ?? payload.collectionDate ?? today;
    const to = payload.collectionTo ?? payload.collectionDate ?? from;
    return `${from}:${to}`;
  }, [today]);

  const mergeDashboardShell = useCallback(
    (
      prev: SchoolDashboardPayload | null,
      incoming: SchoolDashboardPayload,
      headsDateLoaded?: string | null
    ): SchoolDashboardPayload => {
      if (!prev) return incoming;

      const merged: SchoolDashboardPayload = { ...incoming };

      if (incoming.todayCollectionByHead) {
        merged.todayCollectionByHead = incoming.todayCollectionByHead;
      } else if (
        prev.todayCollectionByHead &&
        headsDateLoaded === selectedCollectionRangeKey
      ) {
        merged.todayCollectionByHead = prev.todayCollectionByHead;
      }

      if (
        lastFetchedSummaryDateRef.current === selectedCollectionRangeKey &&
        selectedCollectionRangeKey !== payloadCollectionRangeKey(incoming)
      ) {
        merged.todayCollectionByMethod = prev.todayCollectionByMethod;
        merged.collectionDate = prev.collectionDate;
        merged.collectionFrom = prev.collectionFrom;
        merged.collectionTo = prev.collectionTo;
        merged.stats = {
          ...incoming.stats,
          todayCollectionTotal: prev.stats.todayCollectionTotal,
          todayCollectionTotalRaw: prev.stats.todayCollectionTotalRaw,
        };
      }

      return merged;
    },
    [payloadCollectionRangeKey, selectedCollectionRangeKey]
  );

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    const sid = session?.user?.schoolId ?? null;
    const cached =
      (sid ? peekSchoolDashboard(sid, today) : null) ?? peekSchoolDashboardAny(today);

    let shellLoaded = Boolean(cached);
    if (cached) {
      const cachedHeads =
        cached.todayCollectionByHead ?? peekSchoolDashboardCollectionHeads(today);
      setData(
        cachedHeads
          ? { ...cached, todayCollectionByHead: cachedHeads }
          : cached
      );
      setError(null);
      lastFetchedSummaryDateRef.current = `${today}:${today}`;
      lastFetchedHeadsDateRef.current = cachedHeads ? `${today}:${today}` : null;
      setHeadsLoading(!cachedHeads);
    }

    warmSchoolDashboardCollectionHeads(today);

    let cancelled = false;

    (async () => {
      try {
        if (!shellLoaded) {
          const fast = await fetchSchoolDashboardFast(today, { schoolId: sid });
          if (cancelled) return;
          shellLoaded = true;
          const headsDate = lastFetchedHeadsDateRef.current;
          setData((prev) => {
            const merged = mergeDashboardShell(prev, fast, headsDate);
            if (fast.todayCollectionByHead) {
              setSchoolDashboardCollectionHeadsCached(today, fast.todayCollectionByHead);
              lastFetchedHeadsDateRef.current = `${today}:${today}`;
              setHeadsLoading(false);
            }
            return merged;
          });
          setError(null);
          lastFetchedSummaryDateRef.current = `${today}:${today}`;
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Dashboard fast fetch error:", err);
        const message =
          err instanceof Error ? err.message : "Unable to load dashboard data";
        if (!shellLoaded) {
          setError(message);
          setData(null);
        }
      }
    })();

    void fetchSchoolDashboard(today, { schoolId: sid, revalidate: true })
      .then((full) => {
        if (cancelled) return;
        const headsDate = lastFetchedHeadsDateRef.current;
        setData((prev) => {
          const merged = mergeDashboardShell(prev, full, headsDate);
          if (full.todayCollectionByHead) {
            setSchoolDashboardCollectionHeadsCached(today, full.todayCollectionByHead);
            lastFetchedHeadsDateRef.current = `${today}:${today}`;
            setHeadsLoading(false);
          }
          return merged;
        });
        setError(null);
        lastFetchedSummaryDateRef.current = `${today}:${today}`;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Dashboard full fetch error:", err);
      });

    return () => {
      cancelled = true;
    };
    // schoolId is read inside the effect; server resolves school when client id is missing
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid restart when schoolId hydrates
  }, [sessionStatus, today, mergeDashboardShell]);

  useEffect(() => {
    if (!schoolId || !data) return;
    setSchoolDashboardCached(dashboardCacheKey(schoolId, today), data);
  }, [schoolId, data, today]);

  const fetchCollectionSummaryForDate = useCallback(async (fromYmd: string, toYmd: string) => {
    const rangeKey = `${fromYmd}:${toYmd}`;
    if (rangeKey === lastFetchedSummaryDateRef.current) return;

    collectionAbortRef.current?.abort();
    const controller = new AbortController();
    collectionAbortRef.current = controller;

    setCollectionLoading(true);
    try {
      const summary = await loadSchoolDashboardCollectionSummary(fromYmd, toYmd, controller.signal);
      if (controller.signal.aborted) return;

      lastFetchedSummaryDateRef.current = rangeKey;
      setData((prev) =>
        prev
          ? {
              ...prev,
              todayCollectionByMethod: summary.todayCollectionByMethod,
              collectionDate: summary.collectionDate,
              collectionFrom: summary.collectionFrom,
              collectionTo: summary.collectionTo,
              stats: {
                ...prev.stats,
                todayCollectionTotal: summary.todayCollectionTotal,
                todayCollectionTotalRaw: summary.todayCollectionTotalRaw,
              },
            }
          : prev
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Collection summary fetch error:", err);
    } finally {
      if (!controller.signal.aborted) setCollectionLoading(false);
    }
  }, []);

  const fetchCollectionHeadsForDate = useCallback(async (fromYmd: string, toYmd: string, force = false) => {
    const rangeKey = `${fromYmd}:${toYmd}`;
    if (!force && rangeKey === lastFetchedHeadsDateRef.current) return;

    headsAbortRef.current?.abort();
    const controller = new AbortController();
    headsAbortRef.current = controller;

    setHeadsLoading(true);
    try {
      const byHead = await loadSchoolDashboardCollectionHeads(fromYmd, toYmd, controller.signal);
      if (controller.signal.aborted) return;

      lastFetchedHeadsDateRef.current = rangeKey;
      setData((prev) =>
        prev
          ? {
              ...prev,
              todayCollectionByHead: byHead,
            }
          : prev
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Collection heads fetch error:", err);
    } finally {
      if (!controller.signal.aborted) setHeadsLoading(false);
    }
  }, []);

  const handleCollectionDateRangeChange = useCallback(
    (range: { from: string; to: string }) => {
      const from = range.from || today;
      let to = range.to || from;
      if (from > to) to = from;
      const nextRangeKey = `${from}:${to}`;
      if (nextRangeKey === selectedCollectionRangeKey) return;
      setSelectedCollectionFrom(from);
      setSelectedCollectionTo(to);
      lastFetchedHeadsDateRef.current = null;
      void fetchCollectionSummaryForDate(from, to);
      void fetchCollectionHeadsForDate(from, to);
    },
    [selectedCollectionRangeKey, fetchCollectionSummaryForDate, fetchCollectionHeadsForDate, today]
  );

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    warmSchoolDashboardCollectionHeads(selectedCollectionFrom, selectedCollectionTo);
    const headsLoadedForDate = lastFetchedHeadsDateRef.current === selectedCollectionRangeKey;
    const headsPresent = Boolean(
      data?.todayCollectionByHead ?? peekSchoolDashboardCollectionHeads(selectedCollectionFrom, selectedCollectionTo)
    );
    if (headsLoadedForDate && headsPresent) {
      const peeked = peekSchoolDashboardCollectionHeads(selectedCollectionFrom, selectedCollectionTo);
      if (peeked && !data?.todayCollectionByHead) {
        setData((prev) => (prev ? { ...prev, todayCollectionByHead: peeked } : prev));
        lastFetchedHeadsDateRef.current = selectedCollectionRangeKey;
        setHeadsLoading(false);
      }
      return;
    }
    void fetchCollectionHeadsForDate(selectedCollectionFrom, selectedCollectionTo, !headsPresent);
  }, [sessionStatus, data, selectedCollectionFrom, selectedCollectionTo, selectedCollectionRangeKey, fetchCollectionHeadsForDate]);

  useEffect(() => {
    return () => {
      collectionAbortRef.current?.abort();
      headsAbortRef.current?.abort();
    };
  }, []);

  const emptyCollectionRow = {
    key: "",
    label: "",
    amount: 0,
    formattedAmount: "₹0",
    count: 0,
  };

  const collectionCash = data?.todayCollectionByMethod?.find((r) => r.key === "CASH") ?? {
    ...emptyCollectionRow,
    key: "CASH",
    label: "Cash",
  };
  const collectionOnline = data?.todayCollectionByMethod?.find((r) => r.key === "ONLINE") ?? {
    ...emptyCollectionRow,
    key: "ONLINE",
    label: "Online",
  };

  const showLoader = !data && !error;
  const isInitialLoading = showLoader;

  const retry = () => {
    setError(null);
    void fetchSchoolDashboard(today, { schoolId, revalidate: true })
      .then((json) => {
        setData(json);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to load dashboard");
      });
  };

  return {
    today,
    data,
    error,
    router,
    userName,
    selectedCollectionFrom,
    selectedCollectionTo,
    collectionLoading,
    headsLoading,
    handleCollectionDateRangeChange,
    collectionCash,
    collectionOnline,
    isInitialLoading,
    retry,
  };
}
