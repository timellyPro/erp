import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDebounce } from "@/app/_components/hooks/useDebounce";
import type { SchoolRow } from "../../Schools";
import { deleteSchool, fetchSuperadminSchools } from "@/lib/api/superadminSchools";

const PAGE_SIZE = 10;

export function useSchoolsState() {
  const router = useRouter();
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [modalSchool, setModalSchool] = useState<SchoolRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportingSchoolId, setExportingSchoolId] = useState<string | null>(null);

  const fetchSchools = useCallback(
    async (searchTerm: string, opts?: { silent?: boolean; cacheBust?: boolean }) => {
      const silent = Boolean(opts?.silent);
      if (!silent) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (searchTerm.trim()) params.set("search", searchTerm.trim());
        if (opts?.cacheBust) params.set("_t", String(Date.now()));
        const { ok, data } = await fetchSuperadminSchools(params, { cache: "no-store" });
        if (!ok) throw new Error(data.message || "Failed to load schools");
        setSchools((data.schools as SchoolRow[]) ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error loading schools");
        if (!silent) setSchools([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setPage(1);
    void fetchSchools(debouncedSearch);
  }, [debouncedSearch, fetchSchools]);

  const totalPages = Math.max(1, Math.ceil(schools.length / PAGE_SIZE));
  const paginatedSchools = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return schools.slice(start, start + PAGE_SIZE);
  }, [page, schools]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleDownloadFeesBackup = async (school: SchoolRow) => {
    setExportingSchoolId(school.id);
    try {
      const res = await fetch(`/api/superadmin/schools/${school.id}/fees-backup`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Failed to download fees backup");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ||
        `fees-backup-${school.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not download fees backup");
    } finally {
      setExportingSchoolId(null);
    }
  };

  const handleConfirmDeleteSchool = async () => {
    if (!modalSchool) return;
    const deletedId = modalSchool.id;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const { ok, data } = await deleteSchool(modalSchool.id, confirmName);
      if (!ok) throw new Error(data.message || "Delete failed");
      setModalSchool(null);
      setConfirmName("");
      setSchools((prev) => prev.filter((s) => s.id !== deletedId));
      await fetchSchools(debouncedSearch, { silent: true, cacheBust: true });
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const openDeleteModal = (s: SchoolRow) => {
    setDeleteError(null);
    setConfirmName("");
    setModalSchool(s);
  };

  const closeDeleteModal = () => {
    if (!deleteBusy) {
      setModalSchool(null);
      setConfirmName("");
      setDeleteError(null);
    }
  };

  return {
    schools,
    loading,
    error,
    search,
    setSearch,
    page,
    setPage,
    modalSchool,
    confirmName,
    setConfirmName,
    deleteBusy,
    deleteError,
    exportingSchoolId,
    totalPages,
    paginatedSchools,
    handleDownloadFeesBackup,
    handleConfirmDeleteSchool,
    openDeleteModal,
    closeDeleteModal,
  };
}
