export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "HOLIDAY";
export type DayStatus = AttendanceStatus | "WEEKEND" | "NONE";

export type AttendanceRecord = {
  id: string;
  date: string;
  period: number;
  status: string;
};

export type StudentDetailResponse = {
  student?: {
    name?: string;
    schoolName?: string;
    class?: { name?: string; section?: string | null; displayName?: string } | null;
  };
};

export type MonthSummary = {
  present: number;
  absent: number;
  late: number;
  total: number;
  presentRate: number;
};

export type CalendarCell = {
  key: string;
  day: number;
  isPlaceholder: boolean;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  status: DayStatus;
};

export const WEEK_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

export const STATUS_META: Record<
  DayStatus,
  { label: string; dotClass: string; cardBg: string; textClass: string }
> = {
  PRESENT: {
    label: "Present",
    dotClass: "bg-[#A3E635]/70",
    cardBg: "bg-lime-400/20 border border-lime-300/20",
    textClass: "text-lime-300",
  },
  ABSENT: {
    label: "Absent",
    dotClass: "bg-red-500/70",
    cardBg: "bg-red-500/20 border border-red-400/20",
    textClass: "text-red-300",
  },
  LATE: {
    label: "Late",
    dotClass: "bg-orange-500/70",
    cardBg: "bg-orange-500/20 border border-orange-400/20",
    textClass: "text-orange-300",
  },
  HOLIDAY: {
    label: "Holiday",
    dotClass: "bg-purple-500/70",
    cardBg: "bg-violet-500/20 border border-violet-300/20",
    textClass: "text-violet-300",
  },
  WEEKEND: {
    label: "Weekend",
    dotClass: "bg-white/30",
    cardBg: "bg-white/10 border border-white/10",
    textClass: "text-white/70",
  },
  NONE: {
    label: "No Record",
    dotClass: "bg-white/10",
    cardBg: "bg-white/[0.04] border border-white/5",
    textClass: "text-white/40",
  },
};

export const LEGEND_STATUSES: DayStatus[] = ["PRESENT", "ABSENT", "LATE", "HOLIDAY", "WEEKEND"];

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromDateKey(value: string): Date | null {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function parseApiDateKey(value: string): string | null {
  if (!value) return null;
  const hasTime = value.includes("T");
  const datePart = hasTime ? value.split("T")[0] : value.split(" ")[0];
  const parts = datePart.split("-").map(Number);
  if (parts.length === 3 && parts[0] > 31) {
    const [year, month, day] = parts;
    if (hasTime) {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      const utc = new Date(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate()
      );
      return toDateKey(utc);
    }
    const local = new Date(year, (month ?? 1) - 1, day ?? 1);
    return Number.isNaN(local.getTime()) ? null : toDateKey(local);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : toDateKey(new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function normalizeStatus(status: string): AttendanceStatus | null {
  const s = status.toUpperCase();
  return s === "PRESENT" || s === "ABSENT" || s === "LATE" || s === "HOLIDAY" ? s : null;
}

function statusPriority(status: AttendanceStatus): number {
  if (status === "ABSENT") return 4;
  if (status === "LATE") return 3;
  if (status === "PRESENT") return 2;
  return 1;
}

export function buildDailyStatus(records: AttendanceRecord[]): Record<string, AttendanceStatus> {
  const bestStatusByDay: Record<string, AttendanceStatus> = {};
  const bestScoreByDay: Record<string, number> = {};

  records.forEach((record) => {
    const key = parseApiDateKey(record.date);
    const status = normalizeStatus(record.status);
    if (!key || !status) return;

    const score = statusPriority(status);
    if (score > (bestScoreByDay[key] ?? -1)) {
      bestStatusByDay[key] = status;
      bestScoreByDay[key] = score;
    }
  });

  return bestStatusByDay;
}

export function getMonthSummary(
  dailyStatus: Record<string, AttendanceStatus>,
  monthDate: Date
): MonthSummary {
  const month = monthDate.getMonth();
  const year = monthDate.getFullYear();
  let present = 0;
  let absent = 0;
  let late = 0;

  Object.entries(dailyStatus).forEach(([key, status]) => {
    const date = fromDateKey(key);
    if (!date || date.getMonth() !== month || date.getFullYear() !== year) return;
    if (status === "PRESENT") present += 1;
    if (status === "ABSENT") absent += 1;
    if (status === "LATE") late += 1;
  });

  const total = present + absent + late;
  return { present, absent, late, total, presentRate: total ? (present / total) * 100 : 0 };
}

export function statusForCalendarDay(
  date: Date,
  isCurrentMonth: boolean,
  dailyStatus: Record<string, AttendanceStatus>
): DayStatus {
  if (!isCurrentMonth) return "NONE";
  const key = toDateKey(date);
  if (dailyStatus[key]) return dailyStatus[key];
  const day = date.getDay();
  return day === 0 ? "WEEKEND" : "NONE";
}

export function buildCalendarCells(
  monthCursor: Date,
  selectedDateKey: string,
  dailyStatus: Record<string, AttendanceStatus>
): CalendarCell[] {
  const first = firstDayOfMonth(monthCursor);
  const firstWeekdayOffset = first.getDay();
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const trailingOffset = (7 - ((firstWeekdayOffset + daysInMonth) % 7)) % 7;
  const todayKey = toDateKey(new Date());

  const leadingPlaceholders: CalendarCell[] = Array.from({ length: firstWeekdayOffset }, (_, i) => ({
    key: `leading-${first.getFullYear()}-${first.getMonth()}-${i}`,
    day: 0,
    isPlaceholder: true,
    isCurrentMonth: false,
    isToday: false,
    isSelected: false,
    status: "NONE",
  }));

  const monthCells: CalendarCell[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(first.getFullYear(), first.getMonth(), day);
    const key = toDateKey(date);
    return {
      key,
      day,
      isPlaceholder: false,
      isCurrentMonth: true,
      isToday: key === todayKey,
      isSelected: key === selectedDateKey,
      status: statusForCalendarDay(date, true, dailyStatus),
    };
  });

  const trailingPlaceholders: CalendarCell[] = Array.from({ length: trailingOffset }, (_, i) => ({
    key: `trailing-${first.getFullYear()}-${first.getMonth()}-${i}`,
    day: 0,
    isPlaceholder: true,
    isCurrentMonth: false,
    isToday: false,
    isSelected: false,
    status: "NONE",
  }));

  return [...leadingPlaceholders, ...monthCells, ...trailingPlaceholders];
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatTrend(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function formatMonthLabel(month: Date): string {
  return month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
