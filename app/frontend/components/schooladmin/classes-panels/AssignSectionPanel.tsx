"use client";

import { ArrowRightLeft, Check, Loader2, Plus, Save, Search, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchInput from "../../common/SearchInput";
import SelectInput from "../../common/SelectInput";
import SuccessPopups from "../../common/SuccessPopUps";
import TimellyLoader from "../../common/TimellyLoader";
import { bulkAssignStudentsToClass } from "../../../services/student.service";

type ClassItem = {
  id: string;
  name: string;
  section?: string | null;
};

type SectionStudent = {
  id: string;
  admissionNumber?: string | null;
  rollNo?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
  class?: { id: string; name: string; section?: string | null } | null;
};

interface AssignSectionPanelProps {
  onCancel: () => void;
  onSuccess?: () => void;
}

const NEW_SECTION_VALUE = "__new_section__";

export default function AssignSectionPanel({
  onCancel,
  onSuccess,
}: AssignSectionPanelProps) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassName, setSelectedClassName] = useState("");
  const [students, setStudents] = useState<SectionStudent[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState("");
  const [targetSection, setTargetSection] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadClasses = async () => {
      setIsLoadingClasses(true);
      try {
        const response = await fetch("/api/class/list?lite=1", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Failed to load classes.");
        const data = await response.json();
        if (isActive) {
          setClasses(Array.isArray(data?.classes) ? data.classes : []);
        }
      } catch {
        if (isActive) setClasses([]);
      } finally {
        if (isActive) setIsLoadingClasses(false);
      }
    };

    void loadClasses();
    return () => {
      isActive = false;
    };
  }, []);

  const classNameOptions = useMemo(() => {
    const uniqueNames = Array.from(
      new Set(classes.map((item) => item.name).filter(Boolean))
    ) as string[];
    return [
      {
        label: isLoadingClasses ? "Loading classes..." : "Select Class",
        value: "",
        disabled: true,
      },
      ...uniqueNames.map((name) => ({ label: name, value: name })),
    ];
  }, [classes, isLoadingClasses]);

  const sectionsForClass = useMemo(() => {
    if (!selectedClassName) return [];
    return Array.from(
      new Set(
        classes
          .filter((item) => item.name === selectedClassName && item.section)
          .map((item) => item.section as string)
      )
    );
  }, [classes, selectedClassName]);

  const sectionOptions = useMemo(
    () => [
      { label: "Select Section to Assign", value: "", disabled: true },
      ...sectionsForClass.map((section) => ({ label: section, value: section })),
      { label: "+ Create New Section", value: NEW_SECTION_VALUE },
    ],
    [sectionsForClass]
  );

  const resolvedTargetSectionName = useMemo(() => {
    if (!targetSection) return "";
    if (targetSection === NEW_SECTION_VALUE) return newSectionName.trim();
    return targetSection.trim();
  }, [targetSection, newSectionName]);

  const resolveClassId = useCallback(
    (className: string, section: string) => {
      const normalizedSection = section.trim();
      const match = classes.find(
        (item) =>
          item.name === className &&
          (item.section ?? "") === normalizedSection
      );
      return match?.id ?? null;
    },
    [classes]
  );

  const loadStudents = useCallback(async (className: string) => {
    if (!className) {
      setStudents([]);
      setSelectedStudentIds(new Set());
      return;
    }

    setIsLoadingStudents(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        all: "1",
        take: "10000",
        status: "Active",
        className,
        refresh: "1",
      });
      const response = await fetch(`/api/student/list?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load students.");
      const data = await response.json();
      const list = Array.isArray(data?.students) ? data.students : [];
      setStudents(list);
      setSelectedStudentIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load students.");
      setStudents([]);
      setSelectedStudentIds(new Set());
    } finally {
      setIsLoadingStudents(false);
    }
  }, []);

  useEffect(() => {
    setTargetSection("");
    setNewSectionName("");
    void loadStudents(selectedClassName);
  }, [selectedClassName, loadStudents]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((student) => {
      const name = student.user?.name?.toLowerCase() ?? "";
      const roll = student.rollNo?.toLowerCase() ?? "";
      const admission = student.admissionNumber?.toLowerCase() ?? "";
      const section = student.class?.section?.toLowerCase() ?? "";
      return (
        name.includes(q) ||
        roll.includes(q) ||
        admission.includes(q) ||
        section.includes(q)
      );
    });
  }, [students, studentSearch]);

  const allVisibleSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((s) => selectedStudentIds.has(s.id));

  const someVisibleSelected =
    filteredStudents.some((s) => selectedStudentIds.has(s.id)) && !allVisibleSelected;

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        filteredStudents.forEach((s) => next.delete(s.id));
        return next;
      });
      return;
    }
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedStudentIds(new Set());
  };

  const selectionFilteredBySearch =
    studentSearch.trim().length > 0 &&
    selectedStudentIds.size > 0 &&
    filteredStudents.length < students.length;

  const ensureTargetClassId = async (): Promise<string | null> => {
    if (!selectedClassName) {
      setError("Please select a class.");
      return null;
    }

    if (!resolvedTargetSectionName) {
      setError(
        targetSection === NEW_SECTION_VALUE
          ? "Please enter a new section name."
          : "Please select a section to assign."
      );
      return null;
    }

    let classId = resolveClassId(selectedClassName, resolvedTargetSectionName);
    if (classId) return classId;

    const createRes = await fetch("/api/class/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: selectedClassName,
        section: resolvedTargetSectionName,
      }),
    });
    const createData = await createRes.json().catch(() => null);
    if (!createRes.ok) {
      throw new Error(createData?.message || "Failed to create section.");
    }

    const created = createData?.class as ClassItem | undefined;
    if (created?.id) {
      setClasses((prev) => [...prev, created]);
      setTargetSection(resolvedTargetSectionName);
      setNewSectionName("");
      return created.id;
    }

    const refreshRes = await fetch("/api/class/list?lite=1", {
      credentials: "include",
      cache: "no-store",
    });
    if (refreshRes.ok) {
      const refreshData = await refreshRes.json();
      const refreshed = Array.isArray(refreshData?.classes) ? refreshData.classes : [];
      setClasses(refreshed);
      classId =
        refreshed.find(
          (item: ClassItem) =>
            item.name === selectedClassName &&
            (item.section ?? "") === resolvedTargetSectionName
        )?.id ?? null;
    }

    if (!classId) {
      throw new Error("Section was created but could not be resolved.");
    }
    return classId;
  };

  const canAssign =
    Boolean(selectedClassName) &&
    Boolean(resolvedTargetSectionName) &&
    selectedStudentIds.size > 0 &&
    !isSaving;

  const handleAssign = async () => {
    const studentIds = [...selectedStudentIds];
    if (studentIds.length === 0) {
      setError("Please select at least one student using the checkboxes.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const classId = await ensureTargetClassId();
      if (!classId) return;

      const res = await bulkAssignStudentsToClass(studentIds, classId);
      const result = (await res.json()) as { updatedCount?: number };

      setStudents((prev) =>
        prev.map((student) =>
          studentIds.includes(student.id)
            ? {
                ...student,
                class: {
                  id: classId,
                  name: selectedClassName,
                  section: resolvedTargetSectionName,
                },
              }
            : student
        )
      );
      setSelectedStudentIds(new Set());

      const updatedCount =
        typeof result?.updatedCount === "number"
          ? result.updatedCount
          : studentIds.length;
      setSuccessMessage(
        updatedCount > 0
          ? `Assigned ${updatedCount} student${updatedCount === 1 ? "" : "s"} to section ${resolvedTargetSectionName}.`
          : `All selected students are already in section ${resolvedTargetSectionName}.`
      );
      setShowSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign section.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-[#0F172A]/50 rounded-2xl p-6 border border-white/10 animate-fadeIn shadow-inner space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 text-white font-semibold">
          <ArrowRightLeft size={18} className="text-lime-400" />
          Assign Section
        </div>
        <p className="text-xs text-white/50">
          1. Select class → 2. Pick section → 3. Check students → 4. Assign
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <SelectInput
          label="Select Class"
          value={selectedClassName}
          onChange={setSelectedClassName}
          options={
            classNameOptions.length > 1
              ? classNameOptions
              : [
                  {
                    label: isLoadingClasses ? "Loading..." : "No classes found",
                    value: "",
                    disabled: true,
                  },
                ]
          }
        />

        <SelectInput
          label="Assign to Section"
          value={targetSection}
          onChange={(value) => {
            setTargetSection(value);
            if (value !== NEW_SECTION_VALUE) setNewSectionName("");
          }}
          options={sectionOptions}
          disabled={!selectedClassName}
        />

        {targetSection === NEW_SECTION_VALUE && (
          <SearchInput
            label="New Section Name"
            placeholder="e.g. C"
            showSearchIcon={false}
            value={newSectionName}
            onChange={setNewSectionName}
          />
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {selectedClassName && (
        <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Users size={16} className="text-violet-400" />
              Students in {selectedClassName}
              <span className="text-white/50 font-normal">
                ({filteredStudents.length})
              </span>
              {selectedStudentIds.size > 0 && (
                <span className="rounded-full bg-lime-400/20 border border-lime-400/30 px-2 py-0.5 text-[11px] font-semibold text-lime-300">
                  {selectedStudentIds.size} selected
                  {selectionFilteredBySearch
                    ? ` (${filteredStudents.length} shown)`
                    : ""}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {selectedStudentIds.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white/70 hover:bg-white/10 cursor-pointer"
                >
                  Clear selection
                </button>
              )}
              <div className="w-full sm:w-[240px]">
                <SearchInput
                  value={studentSearch}
                  onChange={setStudentSearch}
                  placeholder="Search students..."
                  icon={Search}
                  variant="glass"
                />
              </div>
            </div>
          </div>

          {isLoadingStudents ? (
            <div className="p-6">
              <TimellyLoader
                compact
                bare
                title="Loading students"
                steps={["Class roster", "Sections"]}
              />
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-8 text-center text-sm text-white/50">
              No active students found for this class.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0B1220]/95 backdrop-blur-sm z-10">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-white/40 border-b border-white/10">
                    <th className="px-4 py-3 w-10">
                      <button
                        type="button"
                        onClick={toggleAllVisible}
                        title={allVisibleSelected ? "Deselect all" : "Select all"}
                        className={`h-5 w-5 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                          allVisibleSelected
                            ? "bg-lime-400 border-lime-400 text-black"
                            : someVisibleSelected
                              ? "bg-lime-400/40 border-lime-400 text-black"
                              : "border-white/20 bg-white/5 text-transparent hover:border-white/40"
                        }`}
                      >
                        <Check size={12} />
                      </button>
                    </th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Roll No</th>
                    <th className="px-4 py-3">Admission No</th>
                    <th className="px-4 py-3">Current Section</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => {
                    const isSelected = selectedStudentIds.has(student.id);
                    const currentSection = student.class?.section ?? "—";

                    return (
                      <tr
                        key={student.id}
                        onClick={() => toggleStudent(student.id)}
                        className={`border-b border-white/5 transition-colors cursor-pointer ${
                          isSelected ? "bg-lime-400/5" : "hover:bg-white/2"
                        }`}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggleStudent(student.id)}
                            className={`h-5 w-5 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-lime-400 border-lime-400 text-black"
                                : "border-white/20 bg-white/5 text-transparent hover:border-white/40"
                            }`}
                          >
                            <Check size={12} />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-white font-medium">
                            {student.user?.name ?? "—"}
                          </div>
                          {student.user?.email && (
                            <div className="text-[11px] text-white/40">
                              {student.user.email}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {student.rollNo ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {student.admissionNumber ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/80">
                            {currentSection || "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filteredStudents.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-t border-white/10 bg-black/30">
              <p className="text-xs text-white/50">
                {selectedStudentIds.size === 0
                  ? "Check the students you want to move, then assign them to the section above."
                  : selectionFilteredBySearch
                    ? `${selectedStudentIds.size} student${selectedStudentIds.size === 1 ? "" : "s"} selected (${filteredStudents.length} visible in search) will be assigned to section ${resolvedTargetSectionName || "—"}.`
                    : resolvedTargetSectionName
                      ? `${selectedStudentIds.size} student${selectedStudentIds.size === 1 ? "" : "s"} will be assigned to section ${resolvedTargetSectionName}.`
                      : `${selectedStudentIds.size} student${selectedStudentIds.size === 1 ? "" : "s"} selected — pick a section above.`}
              </p>
              <button
                type="button"
                onClick={handleAssign}
                disabled={!canAssign}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-semibold text-black hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                {isSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {isSaving
                  ? "Assigning..."
                  : `Assign ${selectedStudentIds.size > 0 ? selectedStudentIds.size : ""} to Section`.trim()}
              </button>
            </div>
          )}
        </div>
      )}

      {!selectedClassName && (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/2 px-4 py-8 text-center text-sm text-white/50">
          <Plus size={20} className="mx-auto mb-2 text-white/30" />
          Select a class to view students and assign sections.
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 cursor-pointer"
        >
          Close
        </button>
      </div>

      <SuccessPopups
        open={showSuccess}
        title={successMessage || "Section assigned successfully"}
        onClose={() => {
          setShowSuccess(false);
          onSuccess?.();
        }}
      />
    </div>
  );
}
