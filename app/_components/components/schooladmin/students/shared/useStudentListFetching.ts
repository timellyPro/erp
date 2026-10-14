import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudentRow, StudentStatusFilter } from "../types";
import {
  clearStudentListCache,
  readStudentListCache,
  writeStudentListCache,
  type StudentListCacheScope,
} from "@/lib/students/studentListSessionCache";

export function useStudentListFetching({
  statusFilter,
  debouncedSearch,
  selectedClass,
  selectedSection,
  selectedClassIdForFetch,
}: {
  statusFilter: StudentStatusFilter;
  debouncedSearch: string;
  selectedClass: string;
  selectedSection: string;
  selectedClassIdForFetch: string;
}) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [inactiveCount, setInactiveCount] = useState<number | null>(null);
  const listFetchGenRef = useRef(0);

  const listCacheScope = useMemo<StudentListCacheScope>(
    () => ({
      status:
        statusFilter === "Active"
          ? "active"
          : statusFilter === "Inactive"
            ? "inactive"
            : "all",
      classId: selectedClassIdForFetch || undefined,
      className: selectedClass || undefined,
      section: selectedSection || undefined,
      q: debouncedSearch || undefined,
    }),
    [
      statusFilter,
      selectedClassIdForFetch,
      selectedClass,
      selectedSection,
      debouncedSearch,
    ]
  );

  const buildListParams = useCallback(
    (bypassCache?: boolean) => {
      const params = new URLSearchParams();
      // One request per filter — avoids slow multi-page appends and wrong counts.
      params.set("all", "1");
      params.set("take", "10000");
      params.set("includeTotal", "1");
      if (bypassCache) params.set("refresh", "1");
      if (statusFilter === "Active") params.set("status", "Active");
      else if (statusFilter === "Inactive") params.set("status", "Inactive");
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (selectedClassIdForFetch) {
        params.set("classId", selectedClassIdForFetch);
      } else {
        if (selectedClass) params.set("className", selectedClass);
        if (selectedSection) params.set("section", selectedSection);
      }
      return params;
    },
    [
      statusFilter,
      debouncedSearch,
      selectedClassIdForFetch,
      selectedClass,
      selectedSection,
    ]
  );

  const fetchStudentList = useCallback(
    async (opts?: { bypassCache?: boolean }) => {
      const gen = ++listFetchGenRef.current;
      const cached = !opts?.bypassCache ? readStudentListCache<StudentRow>(listCacheScope) : null;

      if (cached?.length && !opts?.bypassCache) {
        setStudents(cached);
        setListLoading(false);
      } else {
        setListLoading(true);
      }

      try {
        const params = buildListParams(opts?.bypassCache);
        const res = await fetch(`/api/student/list?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          students?: StudentRow[];
          items?: StudentRow[];
          nextCursor?: string | null;
          total?: number;
          message?: string;
        };
        if (gen !== listFetchGenRef.current) return;
        if (!res.ok) throw new Error(data.message || "Failed to load students");

        const items = Array.isArray(data.students)
          ? data.students
          : Array.isArray(data.items)
            ? data.items
            : [];

        setStudents(items);
        writeStudentListCache(items, listCacheScope);
        setNextCursor(null);
        if (typeof data.total === "number") setTotalCount(data.total);
      } catch {
        if (gen !== listFetchGenRef.current) return;
        if (cached?.length) {
          setStudents(cached);
        } else {
          setStudents([]);
        }
      } finally {
        if (gen === listFetchGenRef.current) {
          setListLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [buildListParams, listCacheScope]
  );

  useEffect(() => {
    setTotalCount(null);
    setNextCursor(null);
    void fetchStudentList();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when filters change
  }, [statusFilter, debouncedSearch, selectedClass, selectedSection, selectedClassIdForFetch]);

  const refreshStats = useCallback(async () => {
    try {
      const [activeRes, inactiveRes] = await Promise.all([
        fetch("/api/student/list?take=1&includeTotal=1&status=Active", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/student/list?take=1&includeTotal=1&status=Inactive", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const activeData = await activeRes.json();
      const inactiveData = await inactiveRes.json();
      if (typeof activeData.total === "number") setActiveCount(activeData.total);
      if (typeof inactiveData.total === "number") {
        setInactiveCount(inactiveData.total);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const refreshList = useCallback(
    (silent?: boolean) => {
      clearStudentListCache();
      setNextCursor(null);
      void fetchStudentList({ bypassCache: !silent });
      void refreshStats();
    },
    [fetchStudentList, refreshStats]
  );

  const patchStudent = useCallback(
    (studentId: string, updater: (row: StudentRow) => StudentRow) => {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? updater(s) : s))
      );
    },
    []
  );

  const removeStudent = useCallback((studentId: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
  }, []);

  return {
    students,
    listLoading,
    loadingMore,
    nextCursor,
    totalCount,
    activeCount,
    inactiveCount,
    refreshStats,
    refreshList,
    patchStudent,
    removeStudent,
  };
}
