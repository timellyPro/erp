"use client";

import { useRef, useEffect, useState, useCallback } from "react";

type StudentOption = {
  id: string;
  name: string;
  admissionNumber: string;
  parentName: string;
  classDisplay: string;
  classId: string;
  section: string | null;
};

type Props = {
  students: StudentOption[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectStudent: (studentId: string) => void;
  selectedId: string | null;
  classFilter?: string;
  sectionFilter?: string;
};

function mapApiRow(s: {
  id: string;
  user?: { name?: string };
  admissionNumber?: string;
  fatherName?: string;
  motherName?: string;
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
  };
}

export const StudentSearchAutocomplete = ({
  students,
  searchQuery,
  onSearchChange,
  onSelectStudent,
  selectedId,
  classFilter = "",
  sectionFilter = "",
}: Props) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [remoteResults, setRemoteResults] = useState<StudentOption[]>([]);
  const [searching, setSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchGenRef = useRef(0);

  const filterByClass = useCallback(
    (list: StudentOption[]) =>
      list.filter((s) => {
        if (classFilter && s.classId !== classFilter) return false;
        if (sectionFilter && s.section !== sectionFilter) return false;
        return true;
      }),
    [classFilter, sectionFilter]
  );

  const localFiltered = filterByClass(
    students.filter((s) => {
      if (!searchQuery.trim()) return false;
      const q = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.admissionNumber.toLowerCase().includes(q)
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
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ q, take: "30" });
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
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, filterByClass]);

  const filteredStudents =
    searchQuery.trim().length >= 2 && remoteResults.length > 0
      ? remoteResults
      : localFiltered;

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
    onSelectStudent(student.id);
    onSearchChange("");
    setShowDropdown(false);
    setHighlightedIndex(-1);
    setRemoteResults([]);
  };

  return (
    <div ref={containerRef} className="relative z-10">
      <label className="text-xs text-gray-500 mb-2 block">Search Student</label>
      <div className="relative overflow-visible">
        <input
          ref={inputRef}
          type="text"
          placeholder="Type name or admission no…"
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

        {showDropdown && filteredStudents.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-2 bg-[#0F172A] border border-white/10 rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto"
          >
            {filteredStudents.map((student, index) => (
              <button
                key={student.id}
                onClick={() => handleSelectStudent(student)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full px-4 py-3 text-left text-sm border-b border-white/5 last:border-0 transition-colors ${
                  index === highlightedIndex
                    ? "bg-blue-500/20 text-white"
                    : selectedId === student.id
                      ? "bg-lime-400/10 text-lime-300"
                      : "text-gray-300 hover:bg-white/5"
                }`}
              >
                <div className="font-semibold text-white">
                  {`${student.name} -${student.admissionNumber || "-"} | ${student.classDisplay || "-"} | ${student.parentName || "-"}`}
                </div>
              </button>
            ))}
          </div>
        )}

        {showDropdown && searchQuery.trim() && filteredStudents.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#0F172A] border border-white/10 rounded-xl p-3 z-50 text-sm text-gray-400 text-center">
            {searching ? "Searching…" : `No students found matching "${searchQuery}"`}
          </div>
        )}
      </div>
    </div>
  );
};
