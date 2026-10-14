export type AttendanceStatus = "present" | "absent" | "late";

export type StudentRow = {
  id: string;
  roll: string;
  name: string;
  avatar: string;
  status: AttendanceStatus;
};

export function formatLongDate(value: string) {
  const parts = value.split("-").map(Number);
  let date: Date;
  if (parts.length === 3 && parts[0] > 31) {
    const [year, month, day] = parts;
    date = new Date(year, (month ?? 1) - 1, day ?? 1);
  } else {
    const [day, month, year] = parts;
    date = new Date(year, (month ?? 1) - 1, day ?? 1);
  }
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export const DEFAULT_PERIOD = 1;

export function toClassOptions(classes: { id: string; name: string; section?: string | null }[]) {
  return classes.map((cls) => ({
    label: cls.section ? `${cls.name}-${cls.section}` : `${cls.name}`,
    value: cls.id,
  }));
}
