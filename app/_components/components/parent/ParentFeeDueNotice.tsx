"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, X } from "lucide-react";

type DueLine = { key: string; label: string; due: number; lastDate: string | null };

const fmtMoney = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Flash notice shown every time the parent opens the app, only while the student still has fee due.
 * Parents with nothing due never see it. Closing it hides it until the next app open.
 */
export default function ParentFeeDueNotice() {
  const { data: session } = useSession();
  const studentId = session?.user?.studentId ?? null;
  const [lines, setLines] = useState<DueLine[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/parent/due-report", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          report?: {
            heads: Array<{ key: string; label: string; due: number }>;
            previousYear: { due: number } | null;
          };
          lastDates?: Record<string, string>;
        };
        if (cancelled || !data.report) return;
        const lastDates = data.lastDates ?? {};
        const out: DueLine[] = data.report.heads
          .filter((h) => h.due > 0)
          .map((h) => ({ key: h.key, label: h.label, due: h.due, lastDate: lastDates[h.key] ?? null }));
        if (data.report.previousYear && data.report.previousYear.due > 0) {
          out.push({
            key: "previousYear",
            label: "Previous Year",
            due: data.report.previousYear.due,
            lastDate: lastDates.previousYear ?? null,
          });
        }
        if (out.length > 0) {
          setLines(out);
          setOpen(true);
        }
      } catch {
        // No notice if the report cannot be loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (!open || lines.length === 0) return null;
  const total = lines.reduce((s, l) => s + l.due, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12141c] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-300" size={20} />
            <h3 className="text-base font-bold text-white">Fee due</h3>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-1.5 text-white/60 hover:bg-white/10"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {lines.map((l) => (
            <li key={l.key} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
              <div>
                <div className="text-sm font-medium text-white">{l.label}</div>
                <div className="text-[11px] text-white/50">
                  {l.lastDate ? `Last date: ${fmtDate(l.lastDate)}` : "No last date set"}
                </div>
              </div>
              <div className="text-sm font-semibold text-amber-300">{fmtMoney(l.due)}</div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between text-sm text-white/80">
          <span>Total due</span>
          <span className="font-semibold text-white">{fmtMoney(total)}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            window.location.href = "/parent?tab=fees";
          }}
          className="mt-4 w-full rounded-xl bg-lime-400 py-2.5 text-sm font-bold text-black"
        >
          View fees
        </button>
      </div>
    </div>
  );
}
