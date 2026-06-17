"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatCard } from "../dashboard/components/StatCard";
import { AttendanceCard } from "./components/AttendanceCard";
import { SidebarList } from "./components/SidebarList";
import { CollectionStatCard } from "./components/CollectionStatCard";
import { DayCollectionByHeadCard } from "./components/DayCollectionByHeadCard";
import { Users, GraduationCap, UserCheck, Wallet } from "lucide-react";
import { todayYmdLocal } from "@/lib/schoolDashboardCollection";
import {
  loadSchoolDashboardCollectionHeads,
  loadSchoolDashboardCollectionSummary,
  peekSchoolDashboardCollectionHeads,
  setSchoolDashboardCollectionHeadsCached,
  warmSchoolDashboardCollectionHeads,
} from "@/lib/loadSchoolDashboardCollection";
import {
  fetchSchoolDashboard,
  fetchSchoolDashboardFast,
  peekSchoolDashboard,
  peekSchoolDashboardAny,
  type SchoolDashboardPayload,
} from "@/lib/loadSchoolDashboard";
import {
  dashboardCacheKey,
  setSchoolDashboardCached,
} from "@/lib/schoolDashboardClientCache";
import { useRouter } from "next/navigation";
import { SchoolDashboardLoader } from "./components/SchoolDashboardLoader";
import { ROUTES } from "@/app/frontend/constants/routes";
import { useSession } from "next-auth/react";

export default function Dashboard() {
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
  const [selectedCollectionDate, setSelectedCollectionDate] = useState(() => todayYmdLocal());
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [headsLoading, setHeadsLoading] = useState(() => !initialHeads);
  const lastFetchedSummaryDateRef = useRef<string | null>(null);
  const lastFetchedHeadsDateRef = useRef<string | null>(
    initialHeads ? today : null
  );
  const collectionAbortRef = useRef<AbortController | null>(null);
  const headsAbortRef = useRef<AbortController | null>(null);
  const { data: session, status: sessionStatus } = useSession();
  const userName = useMemo(() => {
    const n = session?.user?.name?.trim();
    return n ? (n.split(" ")[0] ?? "School") : "School";
  }, [session?.user?.name]);

  const schoolId = session?.user?.schoolId ?? null;

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
        headsDateLoaded === selectedCollectionDate
      ) {
        merged.todayCollectionByHead = prev.todayCollectionByHead;
      }

      if (
        lastFetchedSummaryDateRef.current === selectedCollectionDate &&
        selectedCollectionDate !== (incoming.collectionDate ?? "")
      ) {
        merged.todayCollectionByMethod = prev.todayCollectionByMethod;
        merged.collectionDate = prev.collectionDate;
        merged.stats = {
          ...incoming.stats,
          todayCollectionTotal: prev.stats.todayCollectionTotal,
          todayCollectionTotalRaw: prev.stats.todayCollectionTotalRaw,
        };
      }

      return merged;
    },
    [selectedCollectionDate]
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
      lastFetchedSummaryDateRef.current = today;
      lastFetchedHeadsDateRef.current = cachedHeads ? today : null;
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
              lastFetchedHeadsDateRef.current = today;
              setHeadsLoading(false);
            }
            return merged;
          });
          setError(null);
          lastFetchedSummaryDateRef.current = today;
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
            lastFetchedHeadsDateRef.current = today;
            setHeadsLoading(false);
          }
          return merged;
        });
        setError(null);
        lastFetchedSummaryDateRef.current = today;
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

  const fetchCollectionSummaryForDate = useCallback(async (dateYmd: string) => {
    if (dateYmd === lastFetchedSummaryDateRef.current) return;

    collectionAbortRef.current?.abort();
    const controller = new AbortController();
    collectionAbortRef.current = controller;

    setCollectionLoading(true);
    try {
      const summary = await loadSchoolDashboardCollectionSummary(dateYmd, controller.signal);
      if (controller.signal.aborted) return;

      lastFetchedSummaryDateRef.current = dateYmd;
      setData((prev) =>
        prev
          ? {
              ...prev,
              todayCollectionByMethod: summary.todayCollectionByMethod,
              collectionDate: summary.collectionDate,
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

  const fetchCollectionHeadsForDate = useCallback(async (dateYmd: string, force = false) => {
    if (!force && dateYmd === lastFetchedHeadsDateRef.current) return;

    headsAbortRef.current?.abort();
    const controller = new AbortController();
    headsAbortRef.current = controller;

    setHeadsLoading(true);
    try {
      const byHead = await loadSchoolDashboardCollectionHeads(dateYmd, controller.signal);
      if (controller.signal.aborted) return;

      lastFetchedHeadsDateRef.current = dateYmd;
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

  const handleCollectionDateChange = useCallback(
    (dateYmd: string) => {
      if (!dateYmd || dateYmd === selectedCollectionDate) return;
      setSelectedCollectionDate(dateYmd);
      lastFetchedHeadsDateRef.current = null;
      void fetchCollectionSummaryForDate(dateYmd);
      void fetchCollectionHeadsForDate(dateYmd);
    },
    [selectedCollectionDate, fetchCollectionSummaryForDate, fetchCollectionHeadsForDate]
  );

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    warmSchoolDashboardCollectionHeads(selectedCollectionDate);
    const headsLoadedForDate = lastFetchedHeadsDateRef.current === selectedCollectionDate;
    const headsPresent = Boolean(
      data?.todayCollectionByHead ?? peekSchoolDashboardCollectionHeads(selectedCollectionDate)
    );
    if (headsLoadedForDate && headsPresent) {
      const peeked = peekSchoolDashboardCollectionHeads(selectedCollectionDate);
      if (peeked && !data?.todayCollectionByHead) {
        setData((prev) => (prev ? { ...prev, todayCollectionByHead: peeked } : prev));
        lastFetchedHeadsDateRef.current = selectedCollectionDate;
        setHeadsLoading(false);
      }
      return;
    }
    void fetchCollectionHeadsForDate(selectedCollectionDate, !headsPresent);
  }, [sessionStatus, data, selectedCollectionDate, fetchCollectionHeadsForDate]);

  useEffect(() => {
    return () => {
      collectionAbortRef.current?.abort();
      headsAbortRef.current?.abort();
    };
  }, []);

  const formatChange = (n: number) =>
    n >= 0 ? `+${n} this month` : `${n} this month`;

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

  return (
    <div className="min-h-screen space-y-4 md:space-y-8 max-w-[1900px] mx-auto">
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-6 mb-6 md:mb-10 bg-gradient-to-br from-white/5 to-transparent border border-white/10">
        <div className="min-w-0 mb-4 sm:mb-5">
          <h2 className="text-2xl sm:text-4xl md:text-2xl font-black text-white mb-2 md:mb-3">
            Welcome back, {userName}! 👋
          </h2>
          <p className="text-gray-400 text-sm sm:text-base md:text-md font-medium">
            Here&apos;s what&apos;s happening in your school today.
          </p>
        </div>

        <div
          className={`grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 ${isInitialLoading ? "animate-pulse" : ""}`}
        >
          <StatCard
            label="Total Classes"
            value={isInitialLoading ? "…" : String(data?.stats.totalClasses ?? "—")}
            trend={isInitialLoading ? "Loading" : data ? formatChange(data.stats.totalClassesChange) : "—"}
            Icon={Users}
          />
          <StatCard
            label="Total Students"
            value={isInitialLoading ? "…" : data ? data.stats.totalStudents.toLocaleString() : "—"}
            trend={isInitialLoading ? "Loading" : data ? formatChange(data.stats.totalStudentsChange) : "—"}
            Icon={GraduationCap}
          />
          <StatCard
            label="Total Teachers"
            value={isInitialLoading ? "…" : String(data?.stats.totalTeachers ?? "—")}
            trend={isInitialLoading ? "Loading" : data ? formatChange(data.stats.totalTeachersChange) : "—"}
            Icon={UserCheck}
          />
          <StatCard
            label="Fees Collected"
            value={isInitialLoading ? "…" : data?.stats.feesCollected ?? "—"}
            trend={isInitialLoading ? "Loading" : data ? `${data.stats.feesCollectedPct}% collected` : "—"}
            trendColor="text-lime-400"
            Icon={Wallet}
          />
          <CollectionStatCard
            selectedDate={selectedCollectionDate}
            onDateChange={handleCollectionDateChange}
            totalFormatted={isInitialLoading ? "…" : data?.stats.todayCollectionTotal ?? "₹0"}
            cash={collectionCash}
            online={collectionOnline}
            loading={collectionLoading || isInitialLoading}
          />
        </div>
      </div>

      {isInitialLoading ? (
        <SchoolDashboardLoader />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            <div className="lg:col-span-2">
              <AttendanceCard
                present={data.attendance.present}
                absent={data.attendance.absent}
                late={data.attendance.late}
                total={data.attendance.total}
                overallRate={data.attendance.overallRate}
                presentPct={data.attendance.presentPct}
                absentPct={data.attendance.absentPct}
                latePct={data.attendance.latePct}
              />
            </div>

            <div className="space-y-4 sm:space-y-6 md:space-y-8">
              <SidebarList
                title="Teachers on Leave"
                subtitle="Current leave requests"
                items={data.teachersOnLeave.map((t) => ({
                  title: t.name,
                  subtitle: `${t.subject} • ${t.leaveType.replace("_", " ")}`,
                  meta: `${t.days} day${t.days > 1 ? "s" : ""}`,
                  status: t.status === "APPROVED" ? "Approved" : "Pending",
                  type: "teacher" as const,
                }))}
                onViewAllClick={() => router.push(ROUTES.SCHOOLADMIN_TEACHER_LEAVE_TAB)}
              />
              <SidebarList
                title="Recent Activities"
                subtitle="Latest updates and actions"
                items={data.recentActivities.map((a) => ({
                  title: a.title,
                  subtitle: a.subtitle,
                  meta: a.meta,
                  type: "activity" as const,
                  activityType: (a.type?.includes("Leave")
                    ? "leave"
                    : a.type?.includes("Fee")
                      ? "fee"
                      : a.type?.includes("News")
                        ? "news"
                        : "certificate") as "leave" | "fee" | "news" | "certificate",
                }))}
              />
            </div>
          </div>

          <DayCollectionByHeadCard
            selectedDate={selectedCollectionDate}
            onDateChange={handleCollectionDateChange}
            rows={data.todayCollectionByHead?.rows ?? []}
            formattedTotal={data.todayCollectionByHead?.formattedTotal ?? "0"}
            loading={headsLoading}
          />
        </>
      ) : null}

      {data?.latestNews && data.latestNews.length > 0 && (
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-5 sm:p-6 md:p-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-xl font-bold text-white">Latest News</h3>
              <p className="text-gray-400 text-sm mt-0.5">Recent announcements and updates</p>
            </div>
            <button
              onClick={() => router.push(ROUTES.SCHOOLADMIN_NEWSFEED_TAB)}
              className="rounded-xl bg-lime-400 px-4 sm:px-5 py-2.5 text-sm font-bold text-black hover:bg-lime-300 transition-colors inline-flex items-center gap-1 min-h-[44px] touch-manipulation"
            >
              View All <span>→</span>
            </button>
          </div>
          <div className="space-y-6">
            {data.latestNews.map((n) => (
              <div key={n.id} className="pb-6 border-b border-white/5 last:border-0 last:pb-0">
                <h4 className="text-base font-bold text-white">{n.title}</h4>
                <p className="text-sm text-gray-400 mt-1">{n.description}</p>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-500">Posted by {n.postedBy}</span>
                  <span className="text-xs text-gray-500">{formatTimeAgo(n.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/20 rounded-2xl p-8 text-center">
          <p className="text-red-400 font-semibold mb-2">Error loading dashboard</p>
          <p className="text-red-300/80 text-sm">{error}</p>
          <button
            onClick={() => {
              setError(null);
              void fetchSchoolDashboard(today, { schoolId, revalidate: true })
                .then((json) => {
                  setData(json);
                  setError(null);
                })
                .catch((err) => {
                  setError(err instanceof Error ? err.message : "Unable to load dashboard");
                });
            }}
            className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return d.toLocaleDateString();
}
