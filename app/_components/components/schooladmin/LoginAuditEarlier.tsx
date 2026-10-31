"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import type { EarlierLoginPage } from "@/lib/school/loginAudit";

const PAGE_SIZE = 50;

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dayFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const inputClass =
  "w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-lime-400/50 [color-scheme:dark]";

/**
 * School admin: parents / students who logged in before sign-ins were recorded. The only record of
 * those logins is when the parent accepted the privacy policy, which the portal asks for on the
 * first visit.
 */
export default function LoginAuditEarlier() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EarlierLoginPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wait for typing to pause before searching.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [from, to, q, classId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const params = new URLSearchParams({ view: "earlier", page: String(page), pageSize: String(PAGE_SIZE) });
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (q) params.set("q", q);
        if (classId) params.set("classId", classId);
        const res = await fetch(`/api/school/login-audit?${params}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { message?: string })?.message || "Failed to load earlier logins");
        setData(json as EarlierLoginPage);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message || "Failed to load earlier logins");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [from, to, q, classId, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const firstRow = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRow = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lime-300 bg-lime-400/15">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400 font-medium">Parents / Students who have logged in</p>
            <p className="text-xl font-bold text-white">
              {data ? data.loggedIn : "–"}
              <span className="text-xs font-medium text-gray-500 ml-1.5">
                {data ? `of ${data.activeStudents} active student${data.activeStudents === 1 ? "" : "s"}` : ""}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="block lg:col-span-2">
            <span className="text-xs text-gray-400 font-medium">Search</span>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Student, father or admission no."
                className={`${inputClass} pl-9`}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs text-gray-400 font-medium">Class</span>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">All classes</option>
              {data?.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-gray-400 font-medium">From</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-400 font-medium">To</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          {(from || to) && (
            <div className="sm:col-span-2 lg:col-span-5 flex">
              <button
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="px-3 py-2 rounded-xl text-xs font-medium border border-white/10 bg-black/30 text-gray-300 hover:border-white/20"
              >
                All dates
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          {data?.recordingSince
            ? `Sign-ins are recorded from ${dayFormat.format(new Date(data.recordingSince))}. `
            : "Sign-in recording has just started. "}
          Before that, the only record of a parent logging in is when they accepted the privacy policy, which the
          portal asks for on the first visit. Teachers and admin staff have no earlier record.
        </p>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
        {error ? (
          <p className="p-6 text-sm text-red-300/80">{error}</p>
        ) : !data ? (
          <div className="p-6 space-y-3 animate-pulse" aria-label="Loading earlier logins">
            <div className="h-10 rounded-xl bg-white/5" />
            <div className="h-10 rounded-xl bg-white/5" />
            <div className="h-10 rounded-xl bg-white/5" />
          </div>
        ) : data.entries.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No parent logins match these filters.</p>
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-white/10">
                  <th className="px-5 py-3 font-medium">First logged in</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Details</th>
                  <th className="px-5 py-3 font-medium">Last recorded sign-in</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.userId} className="border-b border-white/5 last:border-0 align-top">
                    <td className="px-5 py-3 text-gray-300 whitespace-nowrap">{timeFormat.format(new Date(e.firstLoginAt))}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-100">{e.name}</p>
                      {e.fatherName && <p className="text-xs text-gray-500 mt-0.5">Father: {e.fatherName}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {e.className ?? "No class"}
                      {e.admissionNumber ? ` • ${e.admissionNumber}` : ""}
                    </td>
                    <td className="px-5 py-3 text-gray-400 whitespace-nowrap">
                      {e.lastSignInAt ? timeFormat.format(new Date(e.lastSignInAt)) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="md:hidden divide-y divide-white/5">
              {data.entries.map((e) => (
                <li key={e.userId} className="p-4 space-y-1">
                  <p className="font-semibold text-gray-100 text-sm break-words">{e.name}</p>
                  <p className="text-xs text-gray-400 break-words">
                    {e.className ?? "No class"}
                    {e.admissionNumber ? ` • ${e.admissionNumber}` : ""}
                    {e.fatherName ? ` • Father: ${e.fatherName}` : ""}
                  </p>
                  <p className="text-xs text-gray-500">First logged in {timeFormat.format(new Date(e.firstLoginAt))}</p>
                  {e.lastSignInAt && <p className="text-xs text-gray-500">Last sign-in {timeFormat.format(new Date(e.lastSignInAt))}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-white/10 text-xs text-gray-400">
            <span>
              {firstRow}–{lastRow} of {data.total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>
                Page {data.page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
