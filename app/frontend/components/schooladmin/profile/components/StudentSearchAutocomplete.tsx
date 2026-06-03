"use client";

import { useRef, useEffect, useState } from "react";

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
    const dropdownRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Filter students based on search query and filters
    const filteredStudents = students.filter((s) => {
        // Apply class filter
        if (classFilter && s.classId !== classFilter) return false;
        // Apply section filter
        if (sectionFilter && s.section !== sectionFilter) return false;
        // Only show dropdown if typing
        if (!searchQuery.trim()) return false;
        // Search by name or admission number
        const q = searchQuery.toLowerCase();
        return (
            s.name.toLowerCase().includes(q) ||
            s.admissionNumber.toLowerCase().includes(q)
        );
    });

    // Close dropdown when clicking outside
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
                    const student = filteredStudents[highlightedIndex];
                    onSelectStudent(student.id);
                    onSearchChange("");
                    setShowDropdown(false);
                    setHighlightedIndex(-1);
                } else if (searchQuery.trim()) {
                    const q = searchQuery.trim().toLowerCase();
                    const exact =
                        students.find((s) => s.admissionNumber.toLowerCase() === q) ??
                        students.find((s) => s.id.toLowerCase() === q);
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
        onSearchChange(""); // Clear search
        setShowDropdown(false);
        setHighlightedIndex(-1);
    };

    return (
        <div ref={containerRef} className="relative z-10">
            <label className="text-xs text-gray-500 mb-2 block">Search Student</label>
            <div className="relative overflow-visible">
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Type name or ID..."
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

                {/* Autocomplete Dropdown - Absolute Position */}
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
                                className={`w-full px-4 py-3 text-left text-sm border-b border-white/5 last:border-0 transition-colors ${index === highlightedIndex
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

                {/* No Results Message */}
                {showDropdown &&
                    searchQuery.trim() &&
                    filteredStudents.length === 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-[#0F172A] border border-white/10 rounded-xl p-3 z-50 text-sm text-gray-400 text-center">
                            No students found matching "{searchQuery}"
                        </div>
                    )}
            </div>
        </div>
    );
};
