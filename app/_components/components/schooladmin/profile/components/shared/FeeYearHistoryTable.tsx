"use client";

import { useCallback, useEffect, useState } from "react";
import { formatRupee } from "@/lib/formatRupee";

type YearRow = {
  academicYearStartYear: number;
  totalFee: number;
  concession: number;
  finalFee: number;
  amountPaid: number;
  balance: number;
};

/** Academic year runs June-May; used until the server confirms it. */
function localAcademicYearStart(): number {
  const now = new Date();
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
}

const yearLabel = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;

/** Student identity shown at the top of the Fees Breakdown. */
export function FeeStudentHeader({
  studentName,
  classDisplayName,
  admissionNumber,
}: {
  studentName?: string;
  classDisplayName?: string;
  admissionNumber?: string;
}) {
  const items: Array<[string, string]> = [
    ["Student Name", studentName || "—"],
    ["Class", classDisplayName || "—"],
    ["Admission No.", admissionNumber || "—"],
  ];
  return (
    <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-gray-400">{k}</p>
          <p className="truncate text-sm font-semibold text-white">{v}</p>
        </div>
      ))}
    </div>
  );
}

/** Year-wise fee table: saved past years plus the current year from live numbers. */
export function FeeYearHistoryTable({
  studentId,
  current,
  canSave,
}: {
  studentId: string;
  current: { totalFee: number; concession: number; finalFee: number; amountPaid: number; balance: number };
  canSave: boolean;
}) {
  const [years, setYears] = useState<YearRow[]>([]);
  const [currentYear, setCurrentYear] = useState<number>(localAcademicYearStart());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/student/${studentId}/fee-year-history`, { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { currentAcademicYearStartYear: number; years: YearRow[] };
      setCurrentYear(data.currentAcademicYearStartYear);
      setYears(data.years);
    } catch {
      // Table still shows the live current year.
    }
  }, [studentId]);

  useEffect(() => {
    setYears([]);
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/student/${studentId}/fee-year-history`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Could not save this year's fees");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const rows: YearRow[] = [
    { academicYearStartYear: currentYear, ...current },
    ...years.filter((y) => y.academicYearStartYear !== currentYear),
  ].sort((a, b) => b.academicYearStartYear - a.academicYearStartYear);

  if (rows.length === 0) return null;

  const cell = "px-4 py-4 whitespace-nowrap text-right text-xl font-bold";
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-300">Fees Breakdown</p>
        {canSave ? (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            title="Save this year's totals to the year-wise history"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save this year"}
          </button>
        ) : null}
      </div>
      {error ? <p className="mb-2 text-xs text-red-400">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-xs font-semibold uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-right text-amber-300">Total Fee</th>
              <th className="px-4 py-3 text-right text-cyan-300">Concession</th>
              <th className="px-4 py-3 text-right text-amber-300">After Concession Final Amount</th>
              <th className="px-4 py-3 text-right text-lime-400">Total Fee Paid</th>
              <th className="px-4 py-3 text-right text-red-400">Total Fee Balance/Due</th>
              <th className="px-4 py-3 text-left text-orange-300">Academic Year</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.academicYearStartYear} className="border-t border-white/5">
                <td className={`${cell} text-white`}>₹{formatRupee(r.totalFee)}</td>
                <td className={`${cell} text-cyan-300`}>₹{formatRupee(r.concession)}</td>
                <td className={`${cell} text-white`}>₹{formatRupee(r.finalFee)}</td>
                <td className={`${cell} text-lime-400`}>₹{formatRupee(r.amountPaid)}</td>
                <td className={`${cell} text-red-400`}>₹{formatRupee(r.balance)}</td>
                <td className="px-4 py-4 whitespace-nowrap text-lg font-bold text-orange-300">
                  {yearLabel(r.academicYearStartYear)}
                  {r.academicYearStartYear === currentYear ? (
                    <span className="ml-2 text-[11px] font-semibold text-lime-400">current</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
