import { useCallback, useEffect, useMemo, useState } from "react";
import { bulkAssignStudentsToClass } from "../../../../services/student.service";

export type ClassItem = {
  id: string;
  name: string;
  section?: string | null;
};

export type SectionStudent = {
  id: string;
  admissionNumber?: string | null;
  rollNo?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
  class?: { id: string; name: string; section?: string | null } | null;
};

export const NEW_SECTION_VALUE = "__new_section__";

export function useAssignSectionState() {
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

  return {
    selectedClassName,
    setSelectedClassName,
    selectedStudentIds,
    studentSearch,
    setStudentSearch,
    targetSection,
    setTargetSection,
    newSectionName,
    setNewSectionName,
    isLoadingClasses,
    isLoadingStudents,
    isSaving,
    showSuccess,
    setShowSuccess,
    successMessage,
    error,
    classNameOptions,
    sectionOptions,
    resolvedTargetSectionName,
    filteredStudents,
    allVisibleSelected,
    someVisibleSelected,
    toggleStudent,
    toggleAllVisible,
    clearSelection,
    selectionFilteredBySearch,
    canAssign,
    handleAssign,
    students,
  };
}
