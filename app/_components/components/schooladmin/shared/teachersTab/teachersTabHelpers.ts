export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "ON_LEAVE"] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

export const todayStr = () => new Date().toISOString().slice(0, 10);

export function attendanceRowsToMap(
  rows: { teacherId: string; status: string }[] | null | undefined
): Record<string, AttendanceStatus> {
  const map: Record<string, AttendanceStatus> = {};
  rows?.forEach((a) => {
    if (ATTENDANCE_STATUSES.includes(a.status as AttendanceStatus)) {
      map[a.teacherId] = a.status as AttendanceStatus;
    }
  });
  return map;
}

export const toLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
