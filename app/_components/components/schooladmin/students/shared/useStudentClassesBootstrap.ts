import { useEffect, useState } from "react";
import { ClassItem } from "../types";
import { getClassesCache, preloadClasses } from "./classesPreload";

export function useStudentClassesBootstrap(stableClasses: ClassItem[]) {
  const [availableClasses, setAvailableClasses] = useState<ClassItem[]>(
    stableClasses.length ? stableClasses : getClassesCache() ?? []
  );
  const [classesLoading, setClassesLoading] = useState(false);

  useEffect(() => {
    if (stableClasses.length) {
      setAvailableClasses(stableClasses);
    }
  }, [stableClasses]);

  useEffect(() => {
    if (stableClasses.length) return;

    const cached = getClassesCache();
    if (cached?.length) {
      setAvailableClasses(cached);
      return;
    }

    let active = true;
    setClassesLoading(true);
    preloadClasses()
      .then((data) => {
        if (!active || !data) return;
        setAvailableClasses(data);
      })
      .finally(() => {
        if (active) setClassesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [stableClasses]);

  return { availableClasses, classesLoading };
}
