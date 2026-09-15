const IST_TIMEZONE = "Asia/Kolkata";

function getISTParts(date: Date): { hour: number; minute: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  const year = get("year");
  const month = get("month");
  const day = get("day");

  return {
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    dateKey: `${year}-${month}-${day}`,
  };
}

export function parseScheduleTime(scheduleTime: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(scheduleTime.trim());
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** True when IST clock has reached today's scheduled time and we have not sent yet today. */
export function shouldRunScheduledBackup(
  scheduleTime: string,
  lastSentAt: Date | null,
  now = new Date()
): boolean {
  const scheduled = parseScheduleTime(scheduleTime);
  if (!scheduled) return false;

  const ist = getISTParts(now);
  const currentMinutes = ist.hour * 60 + ist.minute;
  const scheduledMinutes = scheduled.hour * 60 + scheduled.minute;
  if (currentMinutes < scheduledMinutes) return false;

  if (lastSentAt) {
    const lastIst = getISTParts(lastSentAt);
    if (lastIst.dateKey === ist.dateKey) return false;
  }

  return true;
}

export function formatScheduleTimeForDisplay(scheduleTime: string): string {
  const parsed = parseScheduleTime(scheduleTime);
  if (!parsed) return scheduleTime;
  const h = parsed.hour % 12 || 12;
  const ampm = parsed.hour < 12 ? "AM" : "PM";
  const mm = String(parsed.minute).padStart(2, "0");
  return `${h}:${mm} ${ampm} IST`;
}
