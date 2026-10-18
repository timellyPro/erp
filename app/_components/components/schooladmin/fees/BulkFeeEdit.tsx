"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { fetchClassList } from "@/lib/api/classList";
import { formatRupee } from "@/lib/formatRupee";

type PickStudent = { id: string; admissionNumber: string; name: string; className: string; residency: string };
type ClassOption = { id: string; name: string; section: string | null };

type PlanItem = {
  studentId: string;
  admissionNumber: string;
  name: string | null;
  className: string;
  action: "CREATE" | "UPDATE" | "SKIP";
  reason?: string;
  currentAmount: number;
  newAmount: number;
  delta: number;
  paidOnHead: number;
};
type Plan = { headName: string; amount: number; items: PlanItem[]; willChange: number; skipped: number; totalDelta: number };

type HistoryRow = {
  id: string;
  headName: string;
  amount: number;
  status: string;
  actorName: string | null;
  studentCount: number;
  totalDelta: number;
  createdAt: string;
  undoneAt: string | null;
  undoneByName: string | null;
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-lime-400/50 focus:outline-none";
const btn =
  "rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";

function fmtDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & { message?: string } }> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  return { ok: res.ok, data };
}

export default function BulkFeeEdit() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [residency, setResidency] = useState("");
  const [students, setStudents] = useState<PickStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [maxPick, setMaxPick] = useState(500);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const [headName, setHeadName] = useState("");
  const [amount, setAmount] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | "undo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    fetchClassList()
      .then(({ data }) => setClasses(Array.isArray(data.classes) ? (data.classes as ClassOption[]) : []))
      .catch(() => toast.error("Failed to load classes"));
  }, []);

  const loadHistory = useCallback(async () => {
    const { ok, data } = await api<{ edits: HistoryRow[] }>("/api/fees/bulk-set-head");
    if (ok) setHistory(data.edits ?? []);
  }, []);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    let active = true;
    setLoadingStudents(true);
    const params = new URLSearchParams();
    if (classId) params.set("classId", classId);
    if (residency) params.set("residency", residency);
    api<{ students: PickStudent[]; max: number }>(`/api/fees/bulk-set-head/students?${params}`)
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) {
          toast.error(data.message || "Failed to load students");
          setStudents([]);
          return;
        }
        setStudents(data.students ?? []);
        setMaxPick(data.max ?? 500);
        setSelected(new Set());
        setPlan(null);
      })
      .finally(() => active && setLoadingStudents(false));
    return () => {
      active = false;
    };
  }, [classId, residency]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? students.filter((s) => `${s.name} ${s.admissionNumber}`.toLowerCase().includes(q)) : students;
  }, [students, search]);

  const toggle = (id: string) => {
    setPlan(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => {
    setPlan(null);
    setSelected(new Set(visible.slice(0, maxPick).map((s) => s.id)));
  };

  const amountNum = Number(amount);
  const canPreview =
    selected.size > 0 && selected.size <= maxPick && headName.trim().length > 0 && Number.isFinite(amountNum) && amountNum > 0;

  const body = (mode: "preview" | "apply") => ({
    mode,
    headName: headName.trim(),
    amount: amountNum,
    studentIds: [...selected],
    ...(mode === "apply" && plan ? { confirmCount: plan.willChange } : {}),
  });

  const preview = async () => {
    if (!canPreview || busy) return;
    setBusy("preview");
    setError(null);
    try {
      const { ok, data } = await api<{ plan: Plan }>("/api/fees/bulk-set-head", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body("preview")),
      });
      if (!ok) {
        setPlan(null);
        setError(data.message || "Preview failed");
        return;
      }
      setPlan(data.plan);
    } catch {
      setError("Preview failed. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!plan || plan.willChange === 0 || busy) return;
    const ok = window.confirm(
      `Set "${plan.headName}" to ₹${formatRupee(plan.amount)} for ${plan.willChange} student${plan.willChange === 1 ? "" : "s"}?\n\nTotal change in fees: ${plan.totalDelta >= 0 ? "+" : "-"}₹${formatRupee(Math.abs(plan.totalDelta))}. You can undo this afterwards.`
    );
    if (!ok) return;
    setBusy("apply");
    setError(null);
    try {
      const res = await api<{ changed: number; skipped: number }>("/api/fees/bulk-set-head", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body("apply")),
      });
      if (!res.ok) {
        setError(res.data.message || "Could not apply");
        return;
      }
      toast.success(`Updated ${res.data.changed} student${res.data.changed === 1 ? "" : "s"}.`);
      setPlan(null);
      setSelected(new Set());
      void loadHistory();
    } catch {
      setError("Could not apply. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const undo = async (row: HistoryRow) => {
    if (busy) return;
    if (!window.confirm(`Undo "${row.headName}" for ${row.studentCount} students? Their fees go back to what they were.`)) return;
    setBusy("undo");
    try {
      const res = await api<{ undone: number }>(`/api/fees/bulk-set-head/${encodeURIComponent(row.id)}/undo`, { method: "POST" });
      if (!res.ok) {
        toast.error(res.data.message || "Undo failed");
        return;
      }
      toast.success(`Undone for ${res.data.undone} students.`);
      void loadHistory();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <h3 className="text-lg font-semibold">Bulk fee edit</h3>
      <p className="mt-1 text-sm text-gray-400">
        Set one fee head (for example Hostel Fee or Transport) to the same amount for many students at once. Only this
        year&apos;s records change. You see every student&apos;s before and after first, and the whole change can be undone.
        School, class and section fees are not touched: a student who already gets a fee with that name from one of those is
        skipped.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-gray-400">
          Class
          <select className={`${inputClass} mt-1`} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.section ? ` - ${c.section}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-gray-400">
          Residency
          <select className={`${inputClass} mt-1`} value={residency} onChange={(e) => setResidency(e.target.value)}>
            <option value="">Hostel and day scholars</option>
            <option value="HOSTELLER">Hostellers only</option>
            <option value="DAY_SCHOLAR">Day scholars only</option>
          </select>
        </label>
        <label className="block text-xs text-gray-400">
          Fee head name
          <input
            className={`${inputClass} mt-1`}
            value={headName}
            onChange={(e) => {
              setHeadName(e.target.value);
              setPlan(null);
            }}
            placeholder="e.g. Hostel Fee"
            maxLength={100}
          />
        </label>
        <label className="block text-xs text-gray-400">
          Amount (₹) for the full year
          <input
            className={`${inputClass} mt-1`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setPlan(null);
            }}
            placeholder="e.g. 71500"
          />
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} max-w-xs`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or admission no."
          />
          <button type="button" onClick={selectAllVisible} className={`${btn} border border-white/15 text-white/80 hover:bg-white/5`}>
            Select shown (max {maxPick})
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected(new Set());
              setPlan(null);
            }}
            className={`${btn} border border-white/15 text-white/80 hover:bg-white/5`}
          >
            Clear
          </button>
          <span className="text-xs text-gray-400">
            {selected.size} selected{selected.size > maxPick ? ` (over the ${maxPick} limit)` : ""} · {students.length} students
          </span>
        </div>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-white/5">
          {loadingStudents ? (
            <p className="p-4 text-sm text-gray-400">Loading students…</p>
          ) : visible.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">No students found.</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {visible.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-white/5">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    <span className="min-w-0 flex-1 truncate text-white">{s.name || "-"}</span>
                    <span className="font-mono text-xs text-gray-400">{s.admissionNumber}</span>
                    <span className="hidden text-xs text-gray-400 sm:inline">{s.className}</span>
                    <span className="text-xs text-gray-500">{s.residency}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void preview()} disabled={!canPreview || busy !== null} className={`${btn} bg-lime-400 text-black hover:bg-lime-300`}>
          {busy === "preview" ? "Checking…" : "Preview changes"}
        </button>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>

      {plan ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-sm text-white">
            <strong>{plan.willChange}</strong> student{plan.willChange === 1 ? "" : "s"} will change
            {plan.skipped > 0 ? `, ${plan.skipped} skipped` : ""}. Total change in fees:{" "}
            <strong>
              {plan.totalDelta >= 0 ? "+" : "-"}₹{formatRupee(Math.abs(plan.totalDelta))}
            </strong>
            .
          </p>
          <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-white/5">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="bg-white/5 text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2 text-right">Now</th>
                  <th className="px-3 py-2 text-right">After</th>
                  <th className="px-3 py-2 text-right">Change</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/90">
                {plan.items.map((i) => (
                  <tr key={i.studentId} className={i.action === "SKIP" ? "text-white/45" : ""}>
                    <td className="px-3 py-2">
                      {i.name || "-"} <span className="font-mono text-gray-500">{i.admissionNumber}</span>
                    </td>
                    <td className="px-3 py-2">{i.className || "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">₹{formatRupee(i.currentAmount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{i.action === "SKIP" ? "-" : `₹${formatRupee(i.newAmount)}`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {i.action === "SKIP" ? "-" : `${i.delta >= 0 ? "+" : "-"}₹${formatRupee(Math.abs(i.delta))}`}
                    </td>
                    <td className="px-3 py-2">{i.action === "SKIP" ? i.reason : i.action === "CREATE" ? "Fee will be added" : "Fee will be changed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <button type="button" onClick={() => void apply()} disabled={plan.willChange === 0 || busy !== null} className={`${btn} bg-amber-400 text-black hover:bg-amber-300`}>
              {busy === "apply" ? "Applying…" : `Apply to ${plan.willChange} student${plan.willChange === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      ) : null}

      <h4 className="mt-6 text-sm font-semibold text-white">Recent bulk edits</h4>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">No bulk edits yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
              <span>
                <strong className="text-white">{h.headName}</strong> set to ₹{formatRupee(h.amount)} for {h.studentCount} students (
                {h.totalDelta >= 0 ? "+" : "-"}₹{formatRupee(Math.abs(h.totalDelta))}) by {h.actorName ?? "unknown"} on {fmtDate(h.createdAt)}
                {h.status === "UNDONE" ? ` · undone ${h.undoneAt ? fmtDate(h.undoneAt) : ""}${h.undoneByName ? ` by ${h.undoneByName}` : ""}` : ""}
              </span>
              {h.status === "APPLIED" ? (
                <button type="button" onClick={() => void undo(h)} disabled={busy !== null} className={`${btn} border border-amber-400/40 py-1 text-amber-200 hover:bg-amber-400/10`}>
                  Undo
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
