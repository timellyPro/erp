"use client";

import { DollarSign, Percent, Wallet, AlertTriangle } from "lucide-react";
import type { FeeSummary } from "./types";

interface FeeStatCardsProps {
  stats: FeeSummary | null;
}

export default function FeeStatCards({ stats }: FeeStatCardsProps) {
  const totalFee = stats?.totalFee ?? 0;
  const totalDiscount = stats?.totalDiscount ?? 0;
  const collected = stats?.totalCollected ?? 0;
  const due = stats?.totalDue ?? 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 sm:gap-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-sm text-gray-400">
          <DollarSign size={18} /> Total fee (base)
        </div>
        <div className="break-words text-lg font-bold text-white sm:text-xl">
          ₹{totalFee.toLocaleString("en-IN")}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">Structure + extras before discount</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-sm text-gray-400">
          <Percent size={18} /> Total discount
        </div>
        <div className="break-words text-lg font-bold text-violet-300 sm:text-xl">
          ₹{totalDiscount.toLocaleString("en-IN")}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">Sum of (base − final) per student</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-sm text-gray-400">
          <Wallet size={18} /> Total collected
        </div>
        <div className="break-words text-lg font-bold text-emerald-400 sm:text-xl">
          ₹{collected.toLocaleString("en-IN")}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">Recorded fee payments</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-sm text-gray-400">Total due</div>
        <div className="break-words text-lg font-bold text-amber-400 sm:text-xl">
          ₹{due.toLocaleString("en-IN")}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">Outstanding balance</p>
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
