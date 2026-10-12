"use client";

import { useState, useEffect, useCallback } from "react";

export interface ClassItem {
  id: string;
  name: string;
  section: string | null;
  schoolId: string;
}

interface UseClassesResult {
  classes: ClassItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useClasses(): UseClassesResult {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/class/list");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch classes");
      setClasses(data.classes ?? data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch classes");
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { classes, loading, error, refetch };
}
