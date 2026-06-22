"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { RefreshCcw, Users, GraduationCap, UserCheck, IndianRupee, BadgePercent, Clock3, CalendarDays } from "lucide-react";
import TimellyLoader from "../common/TimellyLoader";

type ChairmanSummary = {
  schoolName: string;
  totalStudents: number;
  activeStudents: number;
  totalClasses: number;
  totalTeachers: number;
  grossFees: number;
  netFees: number;
  totalDiscount: number;
  remainingFees: number;
  todayCollection: number;
  collectionDate?: string;
  totalCollection: number;
  pendingDiscounts: number;
  approvedDiscounts: number;
  rejectedDiscounts: number;
};

const money = (value: number) => `₹${Math.round(value || 0).toLocaleString("en-IN")}`;
const todayYmd = () => new Date().toISOString().slice(0, 10);
const DASHBOARD_SESSION_KEY = "chairman:dashboard:v1";
const DASHBOARD_SESSION_TTL_MS = 5 * 60_000;

function readCachedSummary(date: string): ChairmanSummary | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const store = JSON.parse(sessionStorage.getItem(DASHBOARD_SESSION_KEY) ?? "{}") as Record<
      string,
      { ts: number; summary: ChairmanSummary }
    >;
    const hit = store[date];
    if (!hit || Date.now() - hit.ts > DASHBOARD_SESSION_TTL_MS) return null;
    return hit.summary;
  } catch {
    return null;
  }
}

function writeCachedSummary(date: string, summary: ChairmanSummary): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const store = JSON.parse(sessionStorage.getItem(DASHBOARD_SESSION_KEY) ?? "{}") as Record<
      string,
      { ts: number; summary: ChairmanSummary }
    >;
    store[date] = { ts: Date.now(), summary };
    sessionStorage.setItem(DASHBOARD_SESSION_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function warmChairmanDashboard(date = todayYmd()): void {
  if (readCachedSummary(date)) return;
  const params = new URLSearchParams({ date });
  void fetch(`/api/chairman/dashboard?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      return data.summary as ChairmanSummary | null;
    })
    .then((summary) => {
      if (summary) writeCachedSummary(date, summary);
    })
    .catch(() => {});
}

function Card({
  title,
  value,
  subtitle,
  tone = "lime",
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "lime" | "cyan" | "amber" | "violet" | "rose";
  icon: ReactNode;
}) {
  const toneClass = {
    lime: "from-lime-400/20 to-lime-400/5 text-lime-200",
    cyan: "from-cyan-400/20 to-cyan-400/5 text-cyan-200",
    amber: "from-amber-400/20 to-amber-400/5 text-amber-200",
    violet: "from-violet-400/20 to-violet-400/5 text-violet-200",
    rose: "from-rose-400/20 to-rose-400/5 text-rose-200",
  }[tone];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">{title}</p>
          <p className="mt-2 truncate text-2xl font-bold text-white">{value}</p>
          {subtitle ? <p className="mt-1 text-xs text-white/55">{subtitle}</p> : null}
        </div>
        <div className={`rounded-2xl bg-linear-to-br p-3 ${toneClass}`}>{icon}</div>
      </div>
    </div>
  );
}

export default function ChairmanDashboard() {
  const [collectionDate, setCollectionDate] = useState(todayYmd());
  const [summary, setSummary] = useState<ChairmanSummary | null>(() => readCachedSummary(todayYmd()));
  const [loading, setLoading] = useState(() => readCachedSummary(todayYmd()) == null);
  const [error, setError] = useState("");

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const cached = readCachedSummary(collectionDate);
    if (!opts?.force && cached) {
      setSummary(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const params = new URLSearchParams({ date: collectionDate });
      const res = await fetch(`/api/chairman/dashboard?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to load dashboard");
      const nextSummary = data.summary ?? null;
      setSummary(nextSummary);
      if (nextSummary) writeCachedSummary(collectionDate, nextSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [collectionDate]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <TimellyLoader
        title="Loading chairman dashboard"
        steps={["Collections", "Fee summary", "School metrics"]}
        compact
      />
    );
  }

  if (error || !summary) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error || "Dashboard unavailable"}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl bg-lime-400 px-4 py-2 text-sm font-bold text-black"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <div className="mr-2 flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/70">
          <CalendarDays className="mr-2 h-3.5 w-3.5 text-lime-300" />
          <input
            type="date"
            value={collectionDate}
            onChange={(event) => setCollectionDate(event.target.value || todayYmd())}
            className="scheme-dark bg-transparent text-xs text-white outline-none"
            aria-label="Select collection date"
          />
        </div>
          <button
            type="button"
            onClick={() => void load({ force: true })}
          aria-label="Refresh dashboard"
          title="Refresh"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="Day Collection" value={money(summary.todayCollection)} subtitle={collectionDate} tone="lime" icon={<IndianRupee className="h-5 w-5" />} />
        <Card title="Total Collection" value={money(summary.totalCollection)} subtitle="All successful fee collections" tone="cyan" icon={<IndianRupee className="h-5 w-5" />} />
        <Card title="Net Fees" value={money(summary.netFees)} tone="violet" icon={<IndianRupee className="h-5 w-5" />} />
        <Card title="Overall Discount" value={money(summary.totalDiscount)} tone="amber" icon={<BadgePercent className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="Students" value={String(summary.totalStudents)} subtitle={`${summary.activeStudents} active students`} tone="cyan" icon={<Users className="h-5 w-5" />} />
        <Card title="Classes" value={String(summary.totalClasses)} subtitle="Total classes in school" tone="violet" icon={<GraduationCap className="h-5 w-5" />} />
        <Card title="Teachers" value={String(summary.totalTeachers)} subtitle="Teacher accounts" tone="lime" icon={<UserCheck className="h-5 w-5" />} />
        <Card title="Pending Discounts" value={String(summary.pendingDiscounts)} subtitle={`${summary.approvedDiscounts} approved, ${summary.rejectedDiscounts} rejected`} tone="rose" icon={<Clock3 className="h-5 w-5" />} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-bold text-white">Fees Overview</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wider text-white/45">Gross Fees</p>
            <p className="mt-2 text-xl font-bold text-white">{money(summary.grossFees)}</p>
          </div>
          <div className="rounded-xl bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wider text-white/45">Discount Given</p>
            <p className="mt-2 text-xl font-bold text-amber-200">{money(summary.totalDiscount)}</p>
          </div>
          <div className="rounded-xl bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wider text-white/45">Collectable Net</p>
            <p className="mt-2 text-xl font-bold text-lime-200">{money(summary.netFees)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
