"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { warmStudentDetailsBundle } from "@/lib/loadStudentDetailsBundle";

type StudentOption = {
  id: string;
  name: string;
  admissionNumber: string;
  parentName: string;
  classDisplay: string;
  classId: string;
  section: string | null;
  status?: string;
};

type Props = {
  students: StudentOption[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectStudent: (student: StudentOption) => void;
  selectedId: string | null;
  classFilter?: string;
  sectionFilter?: string;
  statusFilter?: "all" | "active" | "inactive";
};

function mapApiRow(s: {
  id: string;
  user?: { name?: string };
  admissionNumber?: string;
  fatherName?: string;
  motherName?: string;
  status?: string;
  class?: { id: string; name: string; section: string | null };
}): StudentOption {
  return {
    id: s.id,
    name: s.user?.name ?? "Unknown",
    admissionNumber: s.admissionNumber ?? "",
    parentName: s.fatherName?.trim() || s.motherName?.trim() || "-",
    classDisplay: s.class ? `${s.class.name}${s.class.section ? `-${s.class.section}` : ""}` : "-",
    classId: s.class?.id ?? "",
    section: s.class?.section ?? null,
    status: s.status ?? "Active",
  };
}

function matchesStatusFilter(status: string | undefined, filter: "all" | "active" | "inactive") {
  const inactive = (status ?? "Active").trim().toLowerCase() === "inactive";
  if (filter === "inactive") return inactive;
  if (filter === "active") return !inactive;
  return true;
}

export const StudentSearchAutocomplete = ({
  students,
  searchQuery,
  onSearchChange,
  onSelectStudent,
  selectedId,
  classFilter = "",
  sectionFilter = "",
  statusFilter = "all",
}: Props) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [remoteResults, setRemoteResults] = useState<StudentOption[]>([]);
  const [searching, setSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchGenRef = useRef(0);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const syncDropdownRect = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const filterByClass = useCallback(
    (list: StudentOption[]) =>
      list.filter((s) => {
        if (classFilter && s.classId !== classFilter) return false;
        if (sectionFilter && s.section !== sectionFilter) return false;
        if (!matchesStatusFilter(s.status, statusFilter)) return false;
        return true;
      }),
    [classFilter, sectionFilter, statusFilter]
  );

  const localFiltered = filterByClass(
    students.filter((s) => {
      if (!searchQuery.trim()) return false;
      const q = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.admissionNumber.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    })
  );

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setRemoteResults([]);
      setSearching(false);
      return;
    }

    const gen = ++searchGenRef.current;
    setSearching(localFiltered.length === 0);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ take: "20", search: "1", q });
          if (statusFilter === "active") params.set("status", "Active");
          else if (statusFilter === "inactive") params.set("status", "Inactive");
          const res = await fetch(`/api/student/list?${params.toString()}`, {
            credentials: "include",
            cache: "no-store",
          });
          const data = await res.json().catch(() => ({}));
          if (gen !== searchGenRef.current) return;
          const rows = Array.isArray(data?.students) ? data.students : [];
          setRemoteResults(filterByClass(rows.map(mapApiRow)));
        } catch {
          if (gen === searchGenRef.current) setRemoteResults([]);
        } finally {
          if (gen === searchGenRef.current) setSearching(false);
        }
      })();
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, filterByClass, statusFilter, localFiltered.length]);

  const filteredStudents = useMemo(() => {
    const byId = new Map<string, StudentOption>();
    for (const s of localFiltered) byId.set(s.id, s);
    for (const s of remoteResults) byId.set(s.id, s);
    return Array.from(byId.values()).slice(0, 20);
  }, [localFiltered, remoteResults]);

  useEffect(() => {
    if (!showDropdown) {
      setDropdownRect(null);
      return;
    }
    syncDropdownRect();
    window.addEventListener("resize", syncDropdownRect);
    window.addEventListener("scroll", syncDropdownRect, true);
    return () => {
      window.removeEventListener("resize", syncDropdownRect);
      window.removeEventListener("scroll", syncDropdownRect, true);
    };
  }, [showDropdown, syncDropdownRect, filteredStudents.length, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node) &&
        !containerRef.current?.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || filteredStudents.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredStudents.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0) {
          handleSelectStudent(filteredStudents[highlightedIndex]);
        } else if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const exact =
            filteredStudents.find((s) => s.admissionNumber.toLowerCase() === q) ??
            filteredStudents.find((s) => s.id.toLowerCase() === q);
          const pick = exact ?? filteredStudents[0];
          if (pick) handleSelectStudent(pick);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleSelectStudent = (student: StudentOption) => {
    onSelectStudent(student);
    onSearchChange("");
    setShowDropdown(false);
    setHighlightedIndex(-1);
    setRemoteResults([]);
  };

  const dropdownPanel =
    showDropdown && dropdownRect && searchQuery.trim() ? (
      filteredStudents.length > 0 ? (
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: dropdownRect.top,
            left: dropdownRect.left,
            width: dropdownRect.width,
            zIndex: 200,
          }}
          className="bg-[#0F172A] border border-white/10 rounded-xl shadow-2xl max-h-80 overflow-y-auto"
        >
          {filteredStudents.map((student, index) => (
            <button
              key={student.id}
              type="button"
              onClick={() => handleSelectStudent(student)}
              onMouseEnter={() => {
                setHighlightedIndex(index);
                warmStudentDetailsBundle(student.id);
              }}
              className={`w-full px-4 py-3 text-left text-sm border-b border-white/5 last:border-0 transition-colors ${
                index === highlightedIndex
                  ? "bg-blue-500/20 text-white"
                  : selectedId === student.id
                    ? "bg-lime-400/10 text-lime-300"
                    : "text-gray-300 hover:bg-white/5"
              }`}
            >
              <div className="font-semibold text-white break-words">
                {`${student.name} -${student.admissionNumber || "-"} | ${student.classDisplay || "-"} | ${student.parentName || "-"}`}
                {(student.status ?? "Active").trim().toLowerCase() === "inactive" ? (
                  <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-red-300">
                    Inactive
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: dropdownRect.top,
            left: dropdownRect.left,
            width: dropdownRect.width,
            zIndex: 200,
          }}
          className="bg-[#0F172A] border border-white/10 rounded-xl p-3 text-sm text-gray-400 text-center shadow-2xl"
        >
          {searching ? "Searching…" : `No students found matching "${searchQuery}"`}
        </div>
      )
    ) : null;

  return (
    <div ref={containerRef} className="relative z-[60]">
      <label className="text-xs text-gray-500 mb-2 block">Search Student</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder="Type name, admission no., or ID…"
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setShowDropdown(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            if (searchQuery.trim()) {
              setShowDropdown(true);
            }
          }}
          onKeyDown={handleKeyDown}
          className="w-full bg-[#0F172A]/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none text-gray-200 min-h-11 touch-manipulation focus:ring-1 focus:ring-blue-400/50 focus:border-transparent"
          autoComplete="off"
        />
        {mounted && dropdownPanel ? createPortal(dropdownPanel, document.body) : null}
      </div>
    </div>
  );
};
