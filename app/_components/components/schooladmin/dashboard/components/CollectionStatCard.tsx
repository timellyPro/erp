"use client";

import { useRef } from "react";
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

function formatShortDate(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return "Date";
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

/** Fifth dashboard stat card: day collection with calendar, cash & online. */
export function CollectionStatCard({
  selectedDate,
  onDateChange,
  totalFormatted,
  cash,
  online,
  loading = false,
}: Props) {
  const dateInputRef = useRef<HTMLInputElement>(null);

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;

    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  return (
    <div
      className={`col-span-1 sm:col-span-2 xl:col-span-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 sm:p-4 md:p-4 flex-1 min-w-0 transition-opacity ${loading ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
        <div className="p-2 bg-white/5 w-fit rounded-xl">
          <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5 text-lime-400" />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={openDatePicker}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 text-[10px] font-semibold text-white/80 cursor-pointer hover:bg-white/10 sm:h-8 sm:text-xs"
            title="Select date"
          >
            <CalendarDays className="h-3.5 w-3.5 text-lime-400" />
            <span className="whitespace-nowrap">{formatShortDate(selectedDate)}</span>
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="sr-only"
            aria-label="Select collection date"
          />
        </div>
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
          <span className="text-lime-400/90 font-medium normal-case"> · {cash.count} paid</span>
        </p>
        <p className="text-[9px] sm:text-[10px] font-bold tracking-wide uppercase truncate">
          <span className="text-gray-400">Online </span>
          <span className="text-lime-300">{online.formattedAmount}</span>
          <span className="text-lime-400/90 font-medium normal-case"> · {online.count} paid</span>
        </p>
      </div>
    </div>
  );
}
