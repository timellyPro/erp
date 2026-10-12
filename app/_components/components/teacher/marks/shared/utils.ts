import type { LiteClassOption } from "@/lib/teacher/loadTeacherFastTabs";
import type { ClassOption } from "./types";

export const DEFAULT_EXAM_TYPES = ["TERM 1", "TERM 2", "FINAL"];

export function mapLiteClasses(list: LiteClassOption[]): ClassOption[] {
  return list.map((c) => ({ id: c.id, name: c.name, section: c.section ?? null }));
}

export function uniqueSubjects(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = String(raw || "").trim();
    if (!s) continue;
    const key = s.replace(/\s+/g, " ").toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
