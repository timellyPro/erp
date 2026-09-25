"use client";

import { DollarSign, Percent, Wallet, AlertTriangle } from "lucide-react";
import type { FeeSummary } from "./types";
import { formatRupee } from "@/lib/formatRupee";

interface FeeStatCardsProps {
  stats: FeeSummary | null;
}

export default function FeeStatCards({ stats }: FeeStatCardsProps) {
  const totalFee = stats?.totalFee ?? 0;
  const totalDiscount = stats?.totalDiscount ?? 0;
  const collected = stats?.totalCollected ?? 0;
  const due = stats?.totalDue ?? 0;
  const previousYearDue = stats?.previousYearDue ?? 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6 sm:gap-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-sm text-gray-400">
          <DollarSign size={18} /> Current year total
        </div>
        <div className="break-words text-lg font-bold text-white sm:text-xl">
          ₹{formatRupee(totalFee)}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">Excludes previous-year pending</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-sm text-gray-400">
          <Percent size={18} /> Total discount
        </div>
        <div className="break-words text-lg font-bold text-violet-300 sm:text-xl">
          ₹{formatRupee(totalDiscount)}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">Sum of (base − final) per student</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-sm text-gray-400">
          <Wallet size={18} /> Total collected
        </div>
        <div className="break-words text-lg font-bold text-emerald-400 sm:text-xl">
          ₹{formatRupee(collected)}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">Recorded fee payments</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-sm text-gray-400">Total due</div>
        <div className="break-words text-lg font-bold text-amber-400 sm:text-xl">
          ₹{formatRupee(due)}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">Current-year outstanding</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-sm text-gray-400">Previous year due</div>
        <div className="break-words text-lg font-bold text-orange-300 sm:text-xl">
          ₹{formatRupee(previousYearDue)}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">Shown separately from total fees</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-sm text-gray-400">
          <AlertTriangle size={18} /> Critical
        </div>
        <div className="text-lg font-bold text-red-400 sm:text-xl">{stats?.pending ?? 0}</div>
        <p className="mt-1 text-[11px] text-gray-500">Students with balance due</p>
      </div>
    </div>
  );
}
