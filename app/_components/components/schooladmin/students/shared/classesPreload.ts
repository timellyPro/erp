import { ClassItem } from "../types";
import type { ClassesListResponse } from "./hookTypes";

let classesCache: ClassItem[] | null = null;
let classesPromise: Promise<ClassItem[] | null> | null = null;

export const preloadClasses = () => {
  if (classesCache) return Promise.resolve(classesCache);
  if (classesPromise) return classesPromise;

  classesPromise = fetch("/api/class/list?lite=1", { cache: "no-store", credentials: "include" })
    .then(async (res) => {
      if (!res.ok) return null;
      const data: ClassesListResponse = await res.json();
      classesCache = data.classes || [];
      return classesCache;
    })
    .catch(() => null)
    .finally(() => {
      classesPromise = null;
    });

  return classesPromise;
};

/** Current preloaded classes, if the fetch has already completed. */
export const getClassesCache = (): ClassItem[] | null => classesCache;

void preloadClasses();
