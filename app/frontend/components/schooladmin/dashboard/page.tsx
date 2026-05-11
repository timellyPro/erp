"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StatCard } from "../dashboard/components/StatCard";
import { AttendanceCard } from "./components/AttendanceCard";
import { SidebarList } from "./components/SidebarList";
import { Users, GraduationCap, UserCheck, CalendarDays, Wallet } from "lucide-react";
import Spinner from "../../common/Spinner";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/app/frontend/constants/routes";
import { useSession } from "next-auth/react";

type DashboardData = {
  stats: {
    totalClasses: number;
    totalClassesChange: number;
    totalStudents: number;
    totalStudentsChange: number;
    totalTeachers: number;
    totalTeachersChange: number;
    upcomingWorkshops: number;
    workshopsThisWeek: number;
    feesCollected: string;
    feesCollectedPct: number;
    todayCollectionTotal: string;
    todayCollectionTotalRaw: number;
  };
  attendance: {
    present: number;
    absent: number;
    late: number;
    total: number;
    overallRate: number;
    presentPct: string;
    absentPct: string;
    latePct: string;
  };
  workshops: Array<{
    id: string;
    title: string;
    date?: string;
    participants: number;
    status: string;
  }>;
  todayCollectionByMethod: Array<{
    key: string;
    label: string;
    amount: number;
    formattedAmount: string;
    count: number;
  }>;
  teachersOnLeave: Array<{
    id: string;
    name: string;
    subject: string;
    leaveType: string;
    status: string;
    days: number;
  }>;
  recentActivities: Array<{
    type: string;
    title: string;
    subtitle: string;
    meta: string;
  }>;
  latestNews: Array<{
    id: string;
    title: string;
    description: string;
    postedBy: string;
    createdAt: string;
  }>;
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router=useRouter();
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedCollectionDate, setSelectedCollectionDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const { data: session } = useSession();
  const userName = useMemo(() => {
    const n = session?.user?.name?.trim();
    return n ? (n.split(" ")[0] ?? "School") : "School";
  }, [session?.user?.name]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    setLoading(true);
    (async () => {
      try {
        const dashboardRes = await fetch(`/api/school/dashboard?date=${encodeURIComponent(selectedCollectionDate)}`, { 
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!dashboardRes.ok) {
          const errorData = await dashboardRes.json().catch(() => ({}));
          const errorMessage = errorData.message || dashboardRes.statusText || "Failed to load dashboard";
          console.error("Dashboard API error:", errorMessage, "Status:", dashboardRes.status);
          if (!cancelled) {
            setError(errorMessage);
            setData(null);
          }
          return;
        }
        const json = await dashboardRes.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (error) {
        console.error("Dashboard fetch error:", error);
        if (!cancelled) {
          const message =
            error instanceof DOMException && error.name === "AbortError"
              ? "Dashboard request timed out. Please try again."
              : error instanceof Error
              ? error.message
              : "Unable to load dashboard data";
          setError(message);
          setData(null);
        }
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [selectedCollectionDate]);

  const formatChange = (n: number) =>
    n >= 0 ? `+${n} this month` : `${n} this month`;

  const todayCollectionDate = new Date(`${selectedCollectionDate}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const todayCollectionRows = (() => {
    const rows = data?.todayCollectionByMethod ?? [];
    const cash = rows.find((r) => r.key === "CASH") ?? {
      key: "CASH",
      label: "Cash",
      amount: 0,
      formattedAmount: "₹0",
      count: 0,
    };
    const online = rows.find((r) => r.key === "ONLINE") ?? {
      key: "ONLINE",
      label: "Online",
      amount: 0,
      formattedAmount: "₹0",
      count: 0,
    };
    const others = rows.filter((r) => r.key !== "CASH" && r.key !== "ONLINE");
    return [cash, online, ...others];
  })();

  if (loading) {
    return (
      <div className="min-h-screen p-6 md:p-10 flex items-center justify-center">
        <div className="text-white/70"><Spinner/></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-4 md:space-y-8 max-w-[1900px] mx-auto">
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-2 sm:p-8 md:p-4 mb-6 md:mb-10 bg-gradient-to-br from-white/5 to-transparent border-none">
        <h2 className="text-2xl sm:text-4xl md:text-2xl font-black text-white mb-2 md:mb-3">
          Welcome back, {userName}! 👋
        </h2>
        <p className="text-gray-400 text-sm sm:text-base md:text-md font-medium">
          Here&apos;s what&apos;s happening in your school today.
        </p>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-4 sm:gap-4 md:gap-3">
            <StatCard
              label="Total Classes"
              value={String(data.stats.totalClasses)}
              trend={formatChange(data.stats.totalClassesChange)}
              Icon={Users}
            />
            <StatCard
              label="Total Students"
              value={data.stats.totalStudents.toLocaleString()}
              trend={formatChange(data.stats.totalStudentsChange)}
              Icon={GraduationCap}
            />
            <StatCard
              label="Total Teachers"
              value={String(data.stats.totalTeachers)}
              trend={formatChange(data.stats.totalTeachersChange)}
              Icon={UserCheck}
            />
            <StatCard
              label="Today Collection"
              value={data.stats.todayCollectionTotal}
              trend={`${todayCollectionRows.length} payment method${todayCollectionRows.length > 1 ? "s" : ""}`}
              Icon={CalendarDays}
            />
            <StatCard
              label="Fees Collected"
              value={data.stats.feesCollected}
              trend={`${data.stats.feesCollectedPct}% collected`}
              trendColor="text-lime-400"
              Icon={Wallet}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            <div className="lg:col-span-2 space-y-4 sm:space-y-6 lg:space-y-8">
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
              <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-4 sm:p-6 md:p-8">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="font-bold text-xl text-white">Today Collection</h3>
                    <p className="text-gray-400 text-sm mt-0.5">{todayCollectionDate}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={selectedCollectionDate}
                      onChange={(e) => setSelectedCollectionDate(e.target.value)}
                      className="sr-only"
                      aria-label="Select collection date"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!dateInputRef.current) return;
                        if (typeof dateInputRef.current.showPicker === "function") {
                          dateInputRef.current.showPicker();
                        } else {
                          dateInputRef.current.click();
                        }
                      }}
                      className="rounded-xl px-3 py-2 bg-white/10 border border-white/20 text-white hover:bg-white/15 transition-colors"
                      title="Select date"
                    >
                      <CalendarDays className="w-4 h-4" />
                    </button>
                    <div className="rounded-xl px-3 py-2 bg-lime-400/15 border border-lime-300/20">
                      <p className="text-[11px] text-lime-300 font-semibold">Total</p>
                      <p className="text-white font-black text-lg">{data.stats.todayCollectionTotal}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {todayCollectionRows.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-white font-semibold text-sm">{row.label}</p>
                        <p className="text-gray-400 text-xs">{row.count} payment{row.count === 1 ? "" : "s"}</p>
                      </div>
                      <p className="text-lime-300 font-bold text-base">{row.formattedAmount}</p>
                    </div>
                  ))}
                </div>
              </div>
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
                onViewAllClick={()=>router.push(ROUTES.SCHOOLADMIN_TEACHER_LEAVE_TAB)}
              />
              <SidebarList
                title="Recent Activities"
                subtitle="Latest updates and actions"
                items={data.recentActivities.map((a) => ({
                  title: a.title,
                  subtitle: a.subtitle,
                  meta: a.meta,
                  type: "activity" as const,
                  activityType: (a.type?.includes("Leave") ? "leave" : a.type?.includes("Fee") ? "fee" : a.type?.includes("News") ? "news" : "certificate") as "leave" | "fee" | "news" | "certificate",
                }))}
              />
            </div>
          </div>
        </>
      )}

      {data?.latestNews && data.latestNews.length > 0 && (
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-5 sm:p-6 md:p-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-xl font-bold text-white">Latest News</h3>
              <p className="text-gray-400 text-sm mt-0.5">Recent announcements and updates</p>
            </div>
            <button onClick={()=>router.push(ROUTES.SCHOOLADMIN_NEWSFEED_TAB)} className="rounded-xl bg-lime-400 px-4 sm:px-5 py-2.5 text-sm font-bold text-black hover:bg-lime-300 transition-colors inline-flex items-center gap-1 min-h-[44px] touch-manipulation">
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
                  <span className="text-xs text-gray-500">
                    {formatTimeAgo(n.createdAt)}
                  </span>
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
              setLoading(true);
              setError(null);
              window.location.reload();
            }}
            className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      
      {!data && !error && !loading && (
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-8 text-center text-gray-400">
          No dashboard data available.
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
