"use client";

import { Coffee, GraduationCap } from "lucide-react";

export type TimetableEntry = {
  id?: string;
  dayOfWeek: number;
  dayLabel: string;
  slotOrder: number;
  slotType: "PERIOD" | "BREAK" | string;
  title: string;
  subject?: string | null;
  startTime: string;
  endTime: string;
  room?: string | null;
  notes?: string | null;
  teacher?: { id: string; name?: string | null; subject?: string | null } | null;
  teacherId?: string | null;
};

export type TimetablePayload = {
  id?: string;
  title?: string | null;
  notes?: string | null;
  class?: { id: string; name?: string | null; section?: string | null } | null;
  entries?: TimetableEntry[];
} | null;

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

function classLabel(timetable: TimetablePayload) {
  const classRow = timetable?.class;
  if (!classRow) return "";
  return `${classRow.name ?? "Class"}${classRow.section ? ` - ${classRow.section}` : ""}`;
}

export default function TimetableGrid({ timetable, emptyMessage = "No timetable has been published yet." }: { timetable: TimetablePayload; emptyMessage?: string }) {
  const entries = timetable?.entries ?? [];
  const days = DAY_ORDER.filter((day) => entries.some((entry) => entry.dayOfWeek === day));

  if (!timetable || entries.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-white/3 p-8 text-center text-white/65">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">{timetable.title || "Weekly Timetable"}</h2>
            <p className="text-sm text-white/60">{classLabel(timetable)}</p>
          </div>
          {timetable.notes ? <p className="max-w-xl text-sm text-white/60">{timetable.notes}</p> : null}
        </div>
      </div>

      <div className="space-y-5">
        {days.map((day) => {
          const dayEntries = entries
            .filter((entry) => entry.dayOfWeek === day)
            .sort((a, b) => a.slotOrder - b.slotOrder || a.startTime.localeCompare(b.startTime));

          return (
            <section key={day} className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
              <div className="border-b border-white/10 bg-white/5 px-5 py-4">
                <h3 className="text-lg font-semibold text-white">{dayEntries[0]?.dayLabel || DAY_LABELS[day]}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[860px] w-full text-left text-sm">
                  <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/45">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Time</th>
                      <th className="px-4 py-3 font-semibold">Period / Break</th>
                      <th className="px-4 py-3 font-semibold">Subject</th>
                      <th className="px-4 py-3 font-semibold">Teacher</th>
                      <th className="px-4 py-3 font-semibold">Class</th>
                      <th className="px-4 py-3 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {dayEntries.map((entry) => {
                      const isBreak = entry.slotType === "BREAK";
                      return (
                        <tr
                          key={`${entry.dayOfWeek}-${entry.slotOrder}-${entry.startTime}`}
                          className={isBreak ? "bg-amber-300/10" : "bg-white/3"}
                        >
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                                isBreak ? "bg-amber-300/15 text-amber-100" : "bg-lime-300/10 text-lime-200"
                              }`}
                            >
                              {isBreak ? <Coffee className="h-3.5 w-3.5" /> : <GraduationCap className="h-3.5 w-3.5" />}
                              {isBreak ? "Break" : "Period"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/75">{entry.startTime} - {entry.endTime}</td>
                          <td className="px-4 py-3 font-semibold text-white">{entry.title}</td>
                          <td className="px-4 py-3 text-white/70">{isBreak ? "—" : entry.subject || "—"}</td>
                          <td className="px-4 py-3 text-white/70">{entry.teacher?.name || "—"}</td>
                          <td className="px-4 py-3 text-white/70">{entry.room || classLabel(timetable) || "—"}</td>
                          <td className="px-4 py-3 text-white/55">{entry.notes || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
