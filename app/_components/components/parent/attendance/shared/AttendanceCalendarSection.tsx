import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  formatMonthLabel,
  LEGEND_STATUSES,
  STATUS_META,
  WEEK_DAYS,
  type CalendarCell,
} from "../attendanceUtils";

export function AttendanceCalendarSection({
  monthCursor,
  setMonthCursor,
  calendarCells,
  onSelectDate,
}: {
  monthCursor: Date;
  setMonthCursor: (updater: (prev: Date) => Date) => void;
  calendarCells: CalendarCell[];
  onSelectDate: (key: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 sm:px-8 sm:py-5
      px-4 py-3 border-b border-white/[0.05] bg-white/[0.02]">
        <h2 className="text-xl font-bold text-white">{formatMonthLabel(monthCursor)}</h2>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonthCursor((prev) => addMonths(prev, -1))}
            className="p-2 rounded-lg bg-white/[0.05] border
            border-white/[0.1] hover:bg-white/[0.1] hover:text-white text-white/70 transition-all"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonthCursor((prev) => addMonths(prev, 1))}
            className="p-2 rounded-lg bg-white/[0.05] border border-white/[0.1]
             hover:bg-white/[0.1] hover:text-white text-white/70 transition-all0"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="px-3 py-3 sm:px-8 sm:py-5">
        <div className="flex flex-wrap gap-3">
          {LEGEND_STATUSES.map((status) => (
            <div key={status} className="flex items-center gap-2">
              <span className={`h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-md ${STATUS_META[status].dotClass}`} />
              <span className="text-xs text-white/70 font-medium">{STATUS_META[status].label}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-white/10 pt-4 sm:mt-6 sm:pt-6">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-3 text-center text-[11px] sm:text-sm font-bold tracking-wide text-white/45">
            {WEEK_DAYS.map((day) => (
              <div key={day} className="text-center font-bold text-white/50 text-xs uppercase tracking-wider py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="mt-1.5 sm:mt-2 grid grid-cols-7 gap-1.5 sm:gap-3">
            {calendarCells.map((cell) => {
              if (cell.isPlaceholder) {
                return <div key={cell.key} className="aspect-square" aria-hidden="true" />;
              }

              const bg = STATUS_META[cell.status].cardBg;
              const text = cell.isSelected
                ? "text-black"
                : STATUS_META[cell.status].textClass;

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => cell.isCurrentMonth && onSelectDate(cell.key)}
                  disabled={!cell.isCurrentMonth}
                  aria-hidden={!cell.isCurrentMonth}
                  className={[
                    "aspect-square rounded-xl flex items-center justify-center font-semibold transition-all duration-300 relative hover:scale-105 border",
                    bg,
                    cell.isCurrentMonth ? "hover:brightness-110" : "cursor-default pointer-events-none",
                    cell.isSelected
                      ? "!border-white/90 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.7)]"
                      : "",
                    cell.isToday && !cell.isSelected ? "ring-1 ring-white/35" : "",
                  ].join(" ")}
                >
                  <span className={text}>{cell.day}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
