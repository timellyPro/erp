import type { TimetableEntry, TimetablePayload } from "../../../timetable/TimetableGrid";

export type ClassOption = {
  id: string;
  name?: string | null;
  section?: string | null;
};

export type TeacherOption = {
  id: string;
  name?: string | null;
  subject?: string | null;
};

export type EditableEntry = Omit<TimetableEntry, "id" | "teacher"> & {
  clientId: string;
  teacher?: { id: string; name?: string | null; subject?: string | null } | null;
};

export const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

export const makeClientId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const blankEntry = (dayOfWeek = 1, slotOrder = 0): EditableEntry => ({
  clientId: makeClientId(),
  dayOfWeek,
  dayLabel: DAYS.find((day) => day.value === dayOfWeek)?.label ?? "Monday",
  slotOrder,
  slotType: "PERIOD",
  title: "",
  subject: "",
  startTime: "09:00",
  endTime: "09:45",
  room: "",
  notes: "",
  teacherId: "",
  teacher: null,
});

export const classLabel = (classRow?: ClassOption | null) =>
  classRow ? `${classRow.name ?? "Class"}${classRow.section ? ` - ${classRow.section}` : ""}` : "Select class";

export let timetableSetupCache: { classes: ClassOption[]; teachers: TeacherOption[] } | null = null;
export function setTimetableSetupCache(value: { classes: ClassOption[]; teachers: TeacherOption[] } | null) {
  timetableSetupCache = value;
}
export const timetableByClassCache = new Map<string, TimetablePayload | null>();

export function editableEntriesFromTimetable(timetable: TimetablePayload | null): EditableEntry[] {
  return (timetable?.entries ?? []).map((entry) => ({
    ...entry,
    clientId: entry.id ?? makeClientId(),
    teacherId: entry.teacher?.id ?? entry.teacherId ?? "",
    teacher: entry.teacher ?? null,
    subject: entry.subject ?? "",
    room: entry.room ?? "",
    notes: entry.notes ?? "",
  }));
}
