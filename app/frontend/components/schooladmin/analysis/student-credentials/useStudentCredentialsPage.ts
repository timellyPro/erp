"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import type { StudentCredentialRow } from "@/lib/computeStudentCredentials";
import {
  fetchStudentCredentials,
  invalidateStudentCredentialsCache,
  peekStudentCredentials,
  type CredentialsFilterKey,
} from "@/lib/studentCredentialsClientCache";
import { downloadStudentCredentialsPdf } from "@/lib/studentCredentialsPdf";
import { CREDENTIALS_PAGE_SIZE } from "./constants";
import { loadClassesCached, peekClassesCache } from "./loadClassesCached";
import type { ClassItem, CredentialsFilterBody, ExportFormat } from "./types";

function buildExportParams(
  selectedClassId: string,
  selectedClass: string,
  selectedSection: string
) {
  const params = new URLSearchParams();
  if (selectedClassId) {
    params.set("classId", selectedClassId);
  } else {
    if (selectedClass) params.set("className", selectedClass);
    if (selectedSection) params.set("section", selectedSection);
  }
  return params;
}

function buildFilterBody(
  selectedClassId: string,
  selectedClass: string,
  selectedSection: string
): CredentialsFilterBody {
  if (selectedClassId) return { classId: selectedClassId };
  return {
    ...(selectedClass ? { className: selectedClass } : {}),
    ...(selectedSection ? { section: selectedSection } : {}),
  };
}

function filterLabel(selectedClass: string, selectedSection: string): string {
  if (selectedClass) {
    return `${selectedClass}${selectedSection ? ` · ${selectedSection}` : ""}`;
  }
  if (selectedSection) return `Section ${selectedSection}`;
  return "all active students";
}

export function useStudentCredentialsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const schoolId = session?.user?.schoolId ?? "anon";

  const [classes, setClasses] = useState<ClassItem[]>(peekClassesCache() ?? []);
  const [classesLoading, setClassesLoading] = useState(!peekClassesCache()?.length);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [rows, setRows] = useState<StudentCredentialRow[]>([]);
  const [mismatchCount, setMismatchCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [resetting, setResetting] = useState(false);
  const [page, setPage] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

  const selectedClassId = useMemo(() => {
    if (!selectedClass || !selectedSection) return "";
    const match = classes.find(
      (c) => c.name === selectedClass && c.section === selectedSection
    );
    return match?.id ?? "";
  }, [classes, selectedClass, selectedSection]);

  const filterKey = useMemo<CredentialsFilterKey>(
    () => ({
      schoolId,
      ...(selectedClassId
        ? { classId: selectedClassId }
        : {
            ...(selectedClass ? { className: selectedClass } : {}),
            ...(selectedSection ? { section: selectedSection } : {}),
          }),
    }),
    [schoolId, selectedClass, selectedSection, selectedClassId]
  );

  const classOptions = useMemo(() => {
    const names = Array.from(new Set(classes.map((c) => c.name).filter(Boolean)));
    return [
      { label: "All Classes", value: "" },
      ...names.map((name) => ({ label: name, value: name })),
    ];
  }, [classes]);

  const sectionOptions = useMemo(() => {
    const sections = Array.from(
      new Set(
        classes
          .filter((c) => !selectedClass || c.name === selectedClass)
          .map((c) => c.section)
          .filter(Boolean)
      )
    ) as string[];
    return [
      { label: "All Sections", value: "" },
      ...sections.map((section) => ({ label: section, value: section })),
    ];
  }, [classes, selectedClass]);

  useEffect(() => {
    let active = true;
    const cached = peekClassesCache();
    if (cached?.length) {
      setClasses(cached);
      setClassesLoading(false);
      return;
    }
    setClassesLoading(true);
    loadClassesCached()
      .then((data) => {
        if (active) setClasses(data);
      })
      .catch(() => {
        if (active) toast.error("Failed to load classes");
      })
      .finally(() => {
        if (active) setClassesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedSection) return;
    const exists = classes.some(
      (c) =>
        c.section === selectedSection &&
        (!selectedClass || c.name === selectedClass)
    );
    if (!exists) setSelectedSection("");
  }, [classes, selectedClass, selectedSection]);

  const applyPayload = useCallback(
    (payload: { students: StudentCredentialRow[]; mismatchCount?: number }) => {
      setRows(payload.students);
      setMismatchCount(
        typeof payload.mismatchCount === "number"
          ? payload.mismatchCount
          : payload.students.filter((r) => r.accountActive && !r.passwordVerified).length
      );
    },
    []
  );

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const cached = peekStudentCredentials(filterKey);
    const shellLoaded = Boolean(cached);
    if (cached) {
      applyPayload(cached);
      setInitialLoading(false);
    } else {
      setInitialLoading(true);
    }

    let cancelled = false;

    (async () => {
      try {
        setRevalidating(shellLoaded);
        const payload = await fetchStudentCredentials(filterKey, {
          signal: controller.signal,
          revalidate: shellLoaded,
        });
        if (cancelled) return;
        applyPayload(payload);
        setInitialLoading(false);
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        if (!shellLoaded) {
          toast.error(err instanceof Error ? err.message : "Failed to load credentials");
          setRows([]);
          setMismatchCount(0);
        }
        setInitialLoading(false);
      } finally {
        if (!cancelled) setRevalidating(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [filterKey, sessionStatus, applyPayload]);

  useEffect(() => {
    setPage(1);
  }, [selectedClass, selectedSection, searchQuery]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.name,
        row.email,
        row.admissionNumber,
        row.rollNo,
        row.className,
        row.section,
        row.dob,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / CREDENTIALS_PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const pagedRows = filteredRows.slice(
    (pageSafe - 1) * CREDENTIALS_PAGE_SIZE,
    pageSafe * CREDENTIALS_PAGE_SIZE
  );

  const summaryLabel = useMemo(() => {
    const count = filteredRows.length.toLocaleString("en-IN");
    const filter =
      selectedClass || selectedSection
        ? ` · ${selectedClass || "All classes"}${selectedSection ? ` · Section ${selectedSection}` : ""}`
        : "";
    return `${count} student${filteredRows.length === 1 ? "" : "s"}${filter}`;
  }, [filteredRows.length, selectedClass, selectedSection]);

  const handleDownload = async (format: ExportFormat) => {
    if (exporting) return;
    setExporting(format);
    try {
      if (format === "pdf") {
        const verified = filteredRows.filter((r) => r.passwordVerified && r.accountActive);
        if (verified.length === 0) {
          toast.error("No verified credentials to export. Reset passwords first.");
          return;
        }
        const schoolRes = await fetch("/api/school/mine", {
          credentials: "include",
          cache: "no-store",
        });
        const schoolPayload = await schoolRes.json().catch(() => ({}));
        await downloadStudentCredentialsPdf({
          rows: filteredRows,
          selectedClass,
          selectedSection,
          school: schoolPayload?.school as {
            name?: string;
            address?: string;
            location?: string;
            affiliationLine?: string;
            logoUrl?: string | null;
            admins?: Array<{ photoUrl?: string | null }>;
          },
        });
        toast.success("PDF downloaded (verified logins only)");
        return;
      }

      const params = buildExportParams(selectedClassId, selectedClass, selectedSection);
      params.set("format", format);
      params.set("verifiedOnly", "1");
      const res = await fetch(`/api/student/credentials?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        let message = "Export failed";
        try {
          const data = (await res.json()) as { message?: string };
          if (data.message) message = data.message;
        } catch {
          /* ignore */
        }
        toast.error(message);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `student-credentials.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Download started (verified logins only)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const handleResetPasswords = async () => {
    if (resetting) return;
    const ok = window.confirm(
      `Reset passwords to DOB (YYYYMMDD) for ${filterLabel(selectedClass, selectedSection)}?\n\nStudents who changed their password will get the default again.`
    );
    if (!ok) return;

    setResetting(true);
    try {
      const res = await fetch("/api/student/credentials/reset", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildFilterBody(selectedClassId, selectedClass, selectedSection)),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        toast.error(data.message || "Reset failed");
        return;
      }
      toast.success(data.message || "Passwords reset");
      if (schoolId !== "anon") {
        invalidateStudentCredentialsCache(schoolId);
      }
      const payload = await fetchStudentCredentials(filterKey, { revalidate: true });
      applyPayload(payload);
    } catch {
      toast.error("Reset failed");
    } finally {
      setResetting(false);
    }
  };

  return {
    classesLoading,
    selectedClass,
    setSelectedClass,
    selectedSection,
    setSelectedSection,
    searchQuery,
    setSearchQuery,
    classOptions,
    sectionOptions,
    mismatchCount,
    initialLoading,
    revalidating,
    exporting,
    resetting,
    filteredRows,
    pagedRows,
    pageSafe,
    totalPages,
    page,
    setPage,
    summaryLabel,
    handleDownload,
    handleResetPasswords,
  };
}
