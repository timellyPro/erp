import { useCallback, useEffect, useState } from "react";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import type { AdmissionRow } from "./types";

export function useAdmissionListState({
  view,
  setMessageTone,
  setMessage,
}: {
  view: "add" | "all";
  setMessageTone: (tone: "success" | "error") => void;
  setMessage: (message: string | null) => void;
}) {
  const [rows, setRows] = useState<AdmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [paidApplicationsCount, setPaidApplicationsCount] = useState(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [filters, setFilters] = useState<{ gradeSought: string; boardingType: string; from: string; to: string; classId: string }>({
    gradeSought: "",
    boardingType: "",
    from: "",
    to: "",
    classId: "",
  });
  const [listPhase, setListPhase] = useState<"all" | "pending" | "upcoming" | "approved">("all");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const buildAdmissionExportQuery = useCallback(
    (format: "xlsx" | "csv" | "print") => {
      const params = new URLSearchParams();
      params.set("format", format);
      if (listPhase !== "all") params.set("phase", listPhase);
      if (search.trim()) params.set("search", search.trim());
      if (filters.gradeSought) params.set("gradeSought", filters.gradeSought);
      if (filters.boardingType) params.set("boardingType", filters.boardingType);
      if (filters.classId) params.set("classId", filters.classId);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      return params.toString();
    },
    [filters.boardingType, filters.classId, filters.from, filters.gradeSought, filters.to, listPhase, search]
  );

  const exportAdmissions = useCallback(
    (format: "xlsx" | "csv" | "print") => {
      const qs = buildAdmissionExportQuery(format);
      const url = `/api/admissions/export?${qs}`;
      if (format === "print") {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    [buildAdmissionExportQuery]
  );

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("pageSize", "1");
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (filters.gradeSought) params.set("gradeSought", filters.gradeSought);
    if (filters.boardingType) params.set("boardingType", filters.boardingType);
    if (filters.classId) params.set("classId", filters.classId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

    fetch(`/api/admissions/list?${params.toString()}`, { credentials: "include" })
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.message || "Failed to load admissions count");
        setPaidApplicationsCount(Number(d?.paidApplicationsTotal ?? 0));
      })
      .catch(() => setPaidApplicationsCount(0));
  }, [debouncedSearch, filters.gradeSought, filters.boardingType, filters.classId, filters.from, filters.to, reloadKey]);

  useEffect(() => {
    if (view !== "all") return;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (listPhase !== "all") params.set("phase", listPhase);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (filters.gradeSought) params.set("gradeSought", filters.gradeSought);
    if (filters.boardingType) params.set("boardingType", filters.boardingType);
    if (filters.classId) params.set("classId", filters.classId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

    const hadRows = rows.length > 0;
    if (!hadRows) setLoading(true);
    fetch(`/api/admissions/list?${params.toString()}`, { credentials: "include" })
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.message || "Failed to load admissions");
        setRows(Array.isArray(d?.applications) ? d.applications : []);
        const total = Number(d?.total ?? 0);
        setPaidApplicationsCount(Number(d?.paidApplicationsTotal ?? 0));
        const pageSize = Number(d?.pageSize ?? 10);
        const computed = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
        setTotalPages(computed);
        setPage((p) => Math.min(p, computed));
      })
      .catch((e) => {
        setRows([]);
        setPaidApplicationsCount(0);
        setTotalPages(1);
        setMessageTone("error");
        setMessage(e instanceof Error ? e.message : "Failed to load admissions");
      })
      .finally(() => setLoading(false));
  }, [view, page, debouncedSearch, filters.gradeSought, filters.boardingType, filters.classId, filters.from, filters.to, listPhase, reloadKey, rows.length, setMessage, setMessageTone]);

  return {
    rows,
    setRows,
    loading,
    page,
    setPage,
    totalPages,
    paidApplicationsCount,
    search,
    setSearch,
    filters,
    setFilters,
    listPhase,
    setListPhase,
    showExportMenu,
    setShowExportMenu,
    reloadKey,
    setReloadKey,
    exportAdmissions,
  };
}
