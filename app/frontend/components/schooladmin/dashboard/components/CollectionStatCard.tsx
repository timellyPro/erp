"use client";

import { CalendarDays } from "lucide-react";

type CollectionRow = {
  formattedAmount: string;
  count: number;
};

type Props = {
  selectedDate: string;
  onDateChange: (ymd: string) => void;
  totalFormatted: string;
  cash: CollectionRow;
  online: CollectionRow;
  loading?: boolean;
};

/** Fifth dashboard stat card: day collection with calendar, cash & online. */
export function CollectionStatCard({
  selectedDate,
  onDateChange,
  totalFormatted,
  cash,
  online,
  loading = false,
}: Props) {
  return (
    <div
      className={`bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 sm:p-4 md:p-4 flex-1 min-w-0 transition-opacity ${loading ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
        <div className="p-2 sm:p-2.5 bg-white/5 w-fit rounded-xl">
          <CalendarDays className="w-5 h-5 text-lime-400" />
        </div>
        <label
          className="inline-flex items-center rounded-lg border border-white/15 bg-white/5 px-1.5 py-1 cursor-pointer hover:bg-white/10"
          title="Select date"
        >
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="bg-transparent text-white text-[10px] sm:text-xs font-medium outline-none [color-scheme:dark] w-[7.25rem] sm:w-[8rem]"
            aria-label="Select collection date"
          />
        </label>
      </div>
      <p className="text-gray-400 text-[10px] sm:text-xs font-medium uppercase tracking-wider truncate">
        Day Collection
      </p>
      <h3 className="text-lg sm:text-xl md:text-2xl font-bold mt-0.5 mb-1.5 text-white truncate">
        {totalFormatted}
      </h3>
      <div className="space-y-0.5">
        <p className="text-[9px] sm:text-[10px] font-bold tracking-wide uppercase truncate">
          <span className="text-gray-400">Cash </span>
          <span className="text-white">{cash.formattedAmount}</span>
          <span className="text-gray-500 font-medium normal-case"> · {cash.count} paid</span>
        </p>
        <p className="text-[9px] sm:text-[10px] font-bold tracking-wide uppercase truncate">
          <span className="text-gray-400">Online </span>
          <span className="text-lime-300">{online.formattedAmount}</span>
          <span className="text-gray-500 font-medium normal-case"> · {online.count} paid</span>
        </p>
      </div>
    </div>
  );
}
