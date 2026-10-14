import type { ClassItem } from "./types";
import { fetchClassList } from "@/lib/api/classList";

let classesModuleCache: ClassItem[] | null = null;
let classesInflight: Promise<ClassItem[]> | null = null;

export function peekClassesCache(): ClassItem[] | null {
  return classesModuleCache;
}

export async function loadClassesCached(): Promise<ClassItem[]> {
  if (classesModuleCache?.length) return classesModuleCache;
  if (classesInflight) return classesInflight;

  classesInflight = fetchClassList()
    .then(({ data }) => {
      classesModuleCache = Array.isArray(data.classes) ? (data.classes as ClassItem[]) : [];
      return classesModuleCache;
    })
    .finally(() => {
      classesInflight = null;
    });

  return classesInflight;
}
