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
const clampPct = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const DASHBOARD_SESSION_KEY = "chairman:dashboard:v2";
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
    lime: "border-lime-400/35 from-lime-400/15 to-lime-400/5 text-lime-200 shadow-lime-950/20",
    cyan: "border-sky-400/35 from-sky-400/15 to-sky-400/5 text-sky-200 shadow-sky-950/20",
    amber: "border-amber-400/35 from-amber-400/15 to-amber-400/5 text-amber-200 shadow-amber-950/20",
    violet: "border-violet-400/35 from-violet-400/15 to-violet-400/5 text-violet-200 shadow-violet-950/20",
    rose: "border-rose-400/35 from-rose-400/15 to-rose-400/5 text-rose-200 shadow-rose-950/20",
  }[tone];

  return (
    <div className={`relative overflow-hidden rounded-[1.35rem] border bg-white/5 bg-linear-to-br p-3 shadow-xl backdrop-blur-xl sm:p-4 ${toneClass}`}>
      <div className="relative flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45 sm:text-[10px] sm:tracking-[0.24em]">{title}</p>
          <p className="mt-2 break-words text-xl font-black leading-tight tracking-tight text-white sm:text-3xl">{value}</p>
          {subtitle ? <p className="mt-2 text-xs font-medium text-white/45">{subtitle}</p> : null}
        </div>
        <div className="shrink-0 rounded-2xl bg-black/20 p-2 sm:p-3">{icon}</div>
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

  const netPercent = clampPct(summary.grossFees > 0 ? (summary.netFees / summary.grossFees) * 100 : 0);
  const discountPercent = clampPct(summary.grossFees > 0 ? (summary.totalDiscount / summary.grossFees) * 100 : 0);
  const collectedPercent = clampPct(summary.netFees > 0 ? (summary.totalCollection / summary.netFees) * 100 : 0);
  const remainingPercent = clampPct(summary.netFees > 0 ? (summary.remainingFees / summary.netFees) * 100 : 0);
  const discountTotal = summary.pendingDiscounts + summary.approvedDiscounts + summary.rejectedDiscounts;
  const approvedPct = clampPct(discountTotal > 0 ? (summary.approvedDiscounts / discountTotal) * 100 : 0);
  const rejectedPct = clampPct(discountTotal > 0 ? (summary.rejectedDiscounts / discountTotal) * 100 : 0);
  const pendingPct = clampPct(discountTotal > 0 ? (summary.pendingDiscounts / discountTotal) * 100 : 0);
  const collectionRing = `conic-gradient(rgb(74 222 128) 0 ${collectedPercent}%, rgb(251 191 36) ${collectedPercent}% ${Math.min(100, collectedPercent + remainingPercent)}%, rgba(255,255,255,0.08) ${Math.min(100, collectedPercent + remainingPercent)}% 100%)`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-white">Dashboard</h2>
          <p className="mt-1 text-sm text-white/45">{summary.schoolName}</p>
        </div>
        <div className="flex justify-end">
        <div className="mr-2 flex items-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white/70">
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
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card title="Day Collection" value={money(summary.todayCollection)} subtitle={collectionDate} tone="lime" icon={<IndianRupee className="h-5 w-5" />} />
        <Card title="Total Collection" value={money(summary.totalCollection)} subtitle="All successful fee collections" tone="cyan" icon={<IndianRupee className="h-5 w-5" />} />
        <Card title="Net Fees" value={money(summary.netFees)} tone="violet" icon={<IndianRupee className="h-5 w-5" />} />
        <Card title="Overall Discount" value={money(summary.totalDiscount)} tone="amber" icon={<BadgePercent className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card title="Active Students" value={String(summary.activeStudents)} subtitle="Active students only" tone="cyan" icon={<Users className="h-5 w-5" />} />
        <Card title="Classes" value={String(summary.totalClasses)} subtitle="Total classes in school" tone="violet" icon={<GraduationCap className="h-5 w-5" />} />
        <Card title="Teachers" value={String(summary.totalTeachers)} subtitle="Teacher accounts" tone="lime" icon={<UserCheck className="h-5 w-5" />} />
        <Card title="Pending Discounts" value={String(summary.pendingDiscounts)} subtitle={`${summary.approvedDiscounts} approved, ${summary.rejectedDiscounts} rejected`} tone="rose" icon={<Clock3 className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-xl sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Money Flow Map</h2>
              <p className="text-xs text-white/40">Gross fees flowing into discounts, collections and pending dues</p>
            </div>
            <span className="rounded-full bg-lime-400/10 px-3 py-1 text-xs font-bold text-lime-200">
              {Math.round(netPercent)}% collectable
            </span>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex items-center justify-between text-xs text-white/45">
                <span>Gross fee pool</span>
                <span>{money(summary.grossFees)}</span>
              </div>
              <div className="flex h-7 overflow-hidden rounded-full bg-white/10">
                <div
                  className="bg-lime-400/80"
                  style={{ width: `${netPercent}%` }}
                  title={`Net collectable ${money(summary.netFees)}`}
                />
                <div
                  className="bg-amber-400/80"
                  style={{ width: `${discountPercent}%` }}
                  title={`Discount ${money(summary.totalDiscount)}`}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-lime-400/10 px-3 py-2 text-lime-200">
                  Net collectable <span className="font-bold">{money(summary.netFees)}</span>
                </div>
                <div className="rounded-xl bg-amber-400/10 px-3 py-2 text-amber-200">
                  Discounts <span className="font-bold">{money(summary.totalDiscount)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Collected", value: summary.totalCollection, pct: collectedPercent, color: "text-lime-200", bg: "bg-lime-400/10" },
                { label: "Remaining", value: summary.remainingFees, pct: remainingPercent, color: "text-amber-200", bg: "bg-amber-400/10" },
                { label: "Today", value: summary.todayCollection, pct: summary.totalCollection > 0 ? clampPct((summary.todayCollection / summary.totalCollection) * 100) : 0, color: "text-sky-200", bg: "bg-sky-400/10" },
              ].map((item) => (
                <div key={item.label} className={`rounded-2xl ${item.bg} p-3`}>
                  <p className="text-xs text-white/45">{item.label}</p>
                  <p className={`mt-1 text-lg font-black ${item.color}`}>{money(item.value)}</p>
                  <p className="mt-1 text-[11px] text-white/40">{Math.round(item.pct)}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-xl sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Collection Health</h2>
              <p className="text-xs text-white/40">How much of net fees has already come in</p>
            </div>
            <span className="rounded-full bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-200">
              {Math.round(collectedPercent)}% collected
            </span>
          </div>

          <div className="mt-6 flex flex-col items-center gap-5 sm:flex-row">
            <div className="relative h-44 w-44 shrink-0 rounded-full p-3" style={{ background: collectionRing }}>
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#07150d] text-center">
                <p className="text-3xl font-black text-white">{Math.round(collectedPercent)}%</p>
                <p className="text-xs text-white/45">collected</p>
              </div>
            </div>
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-white/60"><i className="h-2.5 w-2.5 rounded-full bg-lime-400" />Collected</span>
                <span className="font-bold text-lime-200">{money(summary.totalCollection)}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-white/60"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />Remaining</span>
                <span className="font-bold text-amber-200">{money(summary.remainingFees)}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-white/60"><i className="h-2.5 w-2.5 rounded-full bg-white/30" />Net target</span>
                <span className="font-bold text-white">{money(summary.netFees)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-xl sm:p-5">
          <div className="relative flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Fees Overview</h2>
              <p className="text-xs text-white/40">Gross to net breakdown</p>
            </div>
            <span className="rounded-full bg-lime-400/10 px-3 py-1 text-xs font-bold text-lime-200">
              {summary.grossFees > 0 ? `${Math.round((summary.netFees / summary.grossFees) * 1000) / 10}% net` : "0% net"}
            </span>
          </div>
          <div className="relative mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
              <p className="flex items-center gap-3 text-sm text-white/60"><span className="h-2.5 w-2.5 rounded-full bg-lime-400" />Gross Fees</p>
              <p className="font-bold text-lime-200">{money(summary.grossFees)}</p>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
              <p className="flex items-center gap-3 text-sm text-white/60"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Discount Given</p>
              <p className="font-bold text-amber-200">-{money(summary.totalDiscount)}</p>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
              <p className="flex items-center gap-3 text-sm text-white/60"><span className="h-2.5 w-2.5 rounded-full bg-sky-400" />Collectable Net</p>
              <p className="font-bold text-sky-200">{money(summary.netFees)}</p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[1.6rem] border border-amber-400/25 bg-white/5 p-4 shadow-xl backdrop-blur-xl sm:p-5">
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Pending Discount Approvals</h2>
              <p className="mt-1 text-sm text-white/45">Chairman review queue</p>
            </div>
            <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-200">
              {summary.pendingDiscounts} pending
            </span>
          </div>
          <div className="relative mt-5 rounded-2xl bg-black/20 p-4">
            <p className="text-4xl font-black text-amber-200">{summary.pendingDiscounts}</p>
            <p className="mt-2 text-sm text-white/50">
              {summary.approvedDiscounts} approved, {summary.rejectedDiscounts} rejected
            </p>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10">
              <div className="bg-lime-400/80" style={{ width: `${approvedPct}%` }} title="Approved discounts" />
              <div className="bg-red-400/80" style={{ width: `${rejectedPct}%` }} title="Rejected discounts" />
              <div className="bg-amber-400/80" style={{ width: `${pendingPct}%` }} title="Pending discounts" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-white/45">
              <span className="rounded-lg bg-lime-400/10 py-1 text-lime-200">{summary.approvedDiscounts} ok</span>
              <span className="rounded-lg bg-red-400/10 py-1 text-red-200">{summary.rejectedDiscounts} no</span>
              <span className="rounded-lg bg-amber-400/10 py-1 text-amber-200">{summary.pendingDiscounts} wait</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
