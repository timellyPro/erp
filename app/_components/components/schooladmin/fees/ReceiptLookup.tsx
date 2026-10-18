"use client";

import { formatReceiptNo } from "@/lib/fees/receiptNumber";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, History, Trash2 } from "lucide-react";
import { formatRupee } from "@/lib/formatRupee";
import { schoolAdminStudentDetailsFeesUrl } from "./studentDetailsNav";

type HistoryEvent = {
  id: string;
  action: string;
  actorName: string | null;
  actorRole: string | null;
  summary: string | null;
  createdAt: string;
};

type FoundPayment = {
  id: string;
  receiptNo: number | null;
  createdAt: string;
  amount: number;
  status: string;
  purpose: string;
  gateway: string | null;
  transactionId: string | null;
  gatewayStatus: string | null;
  collectedByName: string | null;
  refundedTotal: number;
  student: { id: string; name: string | null; admissionNumber: string; class: string | null };
  heads: Array<{ name: string; amount: number; type: string }>;
  history: HistoryEvent[];
};

type DeletedPayment = {
  auditId: string;
  receiptNo: number | null;
  paymentId: string;
  deletedAt: string;
  deletedBy: string | null;
  deletedByRole: string | null;
  summary: string | null;
  amount: number | null;
  transactionId: string | null;
  originalDate: string | null;
  heads: Array<{ name: string | null; amount: number | null }>;
  student: { name: string | null; admissionNumber: string } | null;
};

type LookupResult = { payments: FoundPayment[]; deleted: DeletedPayment[]; truncated: boolean };

const ACTION_LABEL: Record<string, string> = {
  CREATE: "Recorded",
  UPDATE: "Edited",
  DELETE: "Deleted",
  REFUND: "Refunded",
  STATUS: "Gateway update",
  ALERT: "Needs review",
};

function statusClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "SUCCESS" || s === "COMPLETED") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  if (s === "FAILED") return "border-red-400/40 bg-red-400/10 text-red-300";
  return "border-amber-400/40 bg-amber-400/10 text-amber-300";
}

function fmtDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDay(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-lime-400/50 focus:outline-none";

export default function ReceiptLookup() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (loading) return;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (amount.trim()) params.set("amount", amount.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fees/receipt-lookup?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data.message === "string" ? data.message : "Search failed");
        return;
      }
      setResult(data as LookupResult);
      setOpenHistory({});
    } catch {
      setResult(null);
      setError("Search failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setQ("");
    setAmount("");
    setFrom("");
    setTo("");
    setResult(null);
    setError(null);
  };

  const nothingFound = result && result.payments.length === 0 && result.deleted.length === 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <h3 className="text-lg font-semibold">Receipt lookup &amp; payment history</h3>
      <p className="mt-1 text-sm text-gray-400">
        Find a payment from a receipt the parent is holding. This search shows every payment, including pending and
        failed ones, and payments that were deleted. Search by the receipt number (for example R-000123 or 123) or by the UTR / reference number. Receipt
        numbers are printed in the day reports; payments recorded before numbering was introduced were numbered in date order.
      </p>

      <form onSubmit={search} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-xs text-gray-400 lg:col-span-2">
          Receipt no., reference / UTR, student name, admission no. or payment id
          <input
            className={`${inputClass} mt-1`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. 074228089717 or ADM/2026/LS33"
            maxLength={100}
          />
        </label>
        <label className="block text-xs text-gray-400">
          Amount (₹)
          <input
            className={`${inputClass} mt-1`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 12550"
          />
        </label>
        <label className="block text-xs text-gray-400">
          From date
          <input type="date" className={`${inputClass} mt-1`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block text-xs text-gray-400">
          To date
          <input type="date" className={`${inputClass} mt-1`} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-lime-400/40 bg-lime-400/10 px-4 py-2 text-sm font-medium text-lime-300 hover:bg-lime-400/20 disabled:opacity-50"
          >
            <Search size={16} />
            {loading ? "Searching…" : "Search"}
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
          >
            Clear
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {nothingFound && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-4 text-sm text-gray-300">
          No payment, including deleted ones, matches this search. Check the reference number for typos, or try the
          amount and date on their own. If the parent paid online or by bank transfer, the money may not have reached
          the school account yet.
        </div>
      )}

      {result && result.payments.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium text-white">
            {result.payments.length} payment{result.payments.length === 1 ? "" : "s"} found
            {result.truncated ? " (showing the most recent; narrow the search to see others)" : ""}
          </p>
          {result.payments.map((p) => {
            const open = Boolean(openHistory[p.id]);
            return (
              <article key={p.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => router.push(schoolAdminStudentDetailsFeesUrl(p.student.id))}
                      className="text-left text-sm font-semibold text-white underline-offset-2 hover:underline"
                    >
                      {p.student.name ?? "Student"}
                    </button>
                    <p className="text-xs text-gray-400">
                      {p.student.admissionNumber}
                      {p.student.class ? ` · ${p.student.class}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold text-white">₹{formatRupee(p.amount)}</p>
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${statusClass(p.status)}`}>
                      {p.status}
                    </span>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-gray-300 sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Receipt no</dt>
                    <dd>{formatReceiptNo(p.receiptNo)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Date</dt>
                    <dd>{fmtDay(p.createdAt)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Mode</dt>
                    <dd>{p.gateway ?? "-"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Reference</dt>
                    <dd className="break-all">{p.transactionId ?? "-"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Collected by</dt>
                    <dd>{p.collectedByName ?? "-"}</dd>
                  </div>
                  {p.purpose !== "FEES" && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500">Purpose</dt>
                      <dd>{p.purpose}</dd>
                    </div>
                  )}
                  {p.refundedTotal > 0 && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500">Refunded</dt>
                      <dd>₹{formatRupee(p.refundedTotal)}</dd>
                    </div>
                  )}
                </dl>

                {p.heads.length > 0 && (
                  <p className="mt-2 text-xs text-gray-400">
                    Paid towards: {p.heads.map((h) => `${h.name} ₹${formatRupee(h.amount)}`).join(", ")}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setOpenHistory((prev) => ({ ...prev, [p.id]: !open }))}
                  aria-expanded={open}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-lime-300 hover:underline"
                >
                  <History size={14} />
                  {open ? "Hide history" : `History (${p.history.length})`}
                </button>
                {open && (
                  <ol className="mt-2 space-y-1.5 border-l border-white/10 pl-3 text-xs text-gray-300">
                    {p.history.length === 0 && (
                      <li className="text-gray-500">
                        No history recorded. Payments made before the audit trail was added have no history.
                      </li>
                    )}
                    {p.history.map((h) => (
                      <li key={h.id}>
                        <span className="font-medium text-white">{ACTION_LABEL[h.action] ?? h.action}</span>{" "}
                        by {h.actorName ?? "unknown"}
                        {h.actorRole ? ` (${h.actorRole.toLowerCase()})` : ""} · {fmtDate(h.createdAt)}
                        {h.summary && <span className="block text-gray-400">{h.summary}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            );
          })}
        </div>
      )}

      {result && result.deleted.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-red-300">
            <Trash2 size={15} />
            Deleted payments that match
          </p>
          {result.deleted.map((d) => (
            <article key={d.auditId} className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-xs text-gray-300">
              <p className="text-sm font-semibold text-white">
                ₹{d.amount !== null ? formatRupee(d.amount) : "?"}
                {d.student ? ` · ${d.student.name ?? "Student"} (${d.student.admissionNumber})` : ""}
              </p>
              <p className="mt-1">
                Deleted by <span className="text-white">{d.deletedBy ?? "unknown"}</span>
                {d.deletedByRole ? ` (${d.deletedByRole.toLowerCase()})` : ""} on {fmtDate(d.deletedAt)}
              </p>
              <p className="mt-1">
                Originally paid {fmtDay(d.originalDate)}
                {d.receiptNo ? ` · Receipt ${formatReceiptNo(d.receiptNo)}` : ""}
                {d.transactionId ? ` · Reference ${d.transactionId}` : ""}
              </p>
              {d.heads.length > 0 && (
                <p className="mt-1 text-gray-400">
                  It covered: {d.heads.map((h) => `${h.name ?? "Fee"} ₹${h.amount !== null ? formatRupee(h.amount) : "?"}`).join(", ")}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
