import type { ClassItem } from "./types";

let classesModuleCache: ClassItem[] | null = null;
let classesInflight: Promise<ClassItem[]> | null = null;

export function peekClassesCache(): ClassItem[] | null {
  return classesModuleCache;
}

export async function loadClassesCached(): Promise<ClassItem[]> {
  if (classesModuleCache?.length) return classesModuleCache;
  if (classesInflight) return classesInflight;

  classesInflight = fetch("/api/class/list", { credentials: "include", cache: "no-store" })
    .then((res) => res.json())
    .then((data: { classes?: ClassItem[] }) => {
      classesModuleCache = Array.isArray(data.classes) ? data.classes : [];
      return classesModuleCache;
    })
    .finally(() => {
      classesInflight = null;
    });

  return classesInflight;
}
