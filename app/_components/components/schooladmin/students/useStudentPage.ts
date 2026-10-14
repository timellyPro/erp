"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SelectOption,
  StudentRow,
  StudentStatusFilter,
} from "./types";
import { sortStudentsForDisplay } from "./utils";
import type { Props } from "./shared";
import { EMPTY_CLASSES } from "./shared";
import { UseStudentFormAdd as useStudentFormAdd } from "./shared";
import { UseStudentEditDelete as useStudentEditDelete } from "./shared";
import { UseStudentExport as useStudentExport } from "./shared";
import { useStudentClassesBootstrap } from "./shared";
import { useStudentListFetching } from "./shared";

export default function useStudentPage({ classes, reload: _reload }: Props) {
  const stableClasses = classes ?? EMPTY_CLASSES;
  const { availableClasses, classesLoading } = useStudentClassesBootstrap(stableClasses);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentStatusFilter>("Active");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const selectedClassIdForFetch = useMemo(() => {
    if (!selectedClass || !selectedSection) return "";
    const match = availableClasses.find(
      (item) => item.name === selectedClass && item.section === selectedSection
    );
    return match?.id ?? "";
  }, [availableClasses, selectedClass, selectedSection]);

  useEffect(() => {
    if (!selectedSection) return;
    const sectionExists = availableClasses.some(
      (item) =>
        item.section === selectedSection &&
        (!selectedClass || item.name === selectedClass)
    );
    if (!sectionExists) {
      setSelectedSection("");
    }
  }, [availableClasses, selectedClass, selectedSection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const {
    students,
    listLoading,
    loadingMore,
    totalCount,
    activeCount,
    inactiveCount,
    refreshStats,
    refreshList,
    patchStudent,
    removeStudent,
  } = useStudentListFetching({
    statusFilter,
    debouncedSearch,
    selectedClass,
    selectedSection,
    selectedClassIdForFetch,
  });

  const filterClassOptions = useMemo<SelectOption[]>(() => {
    const uniqueNames = Array.from(
      new Set(availableClasses.map((item) => item.name).filter(Boolean))
    ) as string[];
    return [
      { label: "All Classes", value: "" },
      ...uniqueNames.map((name) => ({ label: name, value: name })),
    ];
  }, [availableClasses]);

  const filterSectionOptions = useMemo<SelectOption[]>(() => {
    const sections = Array.from(
      new Set(
        availableClasses
          .filter((item) => !selectedClass || item.name === selectedClass)
          .map((item) => item.section)
          .filter(Boolean)
      )
    ) as string[];
    return [
      { label: "All Sections", value: "" },
      ...sections.map((section) => ({ label: section, value: section })),
    ];
  }, [availableClasses, selectedClass]);

  const formClassOptions = useMemo<SelectOption[]>(() => {
    if (classesLoading) {
      return [{ label: "Loading classes...", value: "" }];
    }
    if (!availableClasses.length) {
      return [{ label: "No classes found", value: "" }];
    }
    return [
      { label: "Select Class", value: "" },
      ...availableClasses.map((item) => ({
        label: `${item.name}${item.section ? ` - ${item.section}` : ""}`,
        value: item.id,
      })),
    ];
  }, [availableClasses, classesLoading]);

  const formSectionOptions = useMemo<SelectOption[]>(() => {
    const sections = Array.from(
      new Set(availableClasses.map((item) => item.section).filter(Boolean))
    ) as string[];
    if (classesLoading) {
      return [{ label: "Loading sections...", value: "" }];
    }
    if (!sections.length) {
      return [{ label: "No sections found", value: "" }];
    }
    return [
      { label: "Select Section", value: "" },
      ...sections.map((section) => ({ label: section, value: section })),
    ];
  }, [availableClasses, classesLoading]);

  const filteredStudents = useMemo<StudentRow[]>(() => {
    let list: StudentRow[] = students;
    if (selectedClass) {
      list = list.filter((student) => student.class?.name === selectedClass);
    }
    if (selectedSection) {
      list = list.filter((student) => student.class?.section === selectedSection);
    }
    if (statusFilter === "Active") {
      list = list.filter((student) => (student.status || "Active") === "Active");
    } else if (statusFilter === "Inactive") {
      list = list.filter((student) => student.status === "Inactive");
    }
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      list = list.filter((student) => {
        const name = student.user?.name || student.name || "";
        const email = student.user?.email || student.email || "";
        const roll = student.rollNo || "";
        const phone = student.phoneNo || "";
        return (
          name.toLowerCase().includes(query) ||
          email.toLowerCase().includes(query) ||
          roll.toLowerCase().includes(query) ||
          phone.toLowerCase().includes(query)
        );
      });
    }
    return sortStudentsForDisplay(list);
  }, [
    searchQuery,
    selectedClass,
    selectedSection,
    statusFilter,
    students,
  ]);

  const selectedClassObj = availableClasses.find(
    (item) =>
      item.name === selectedClass &&
      (!selectedSection || item.section === selectedSection)
  );

  const formAdd = useStudentFormAdd({ statusFilter, refreshStats, refreshList });

  useEffect(() => {
    if (!formAdd.form.classId && selectedClassIdForFetch) {
      formAdd.setForm((prev) => ({ ...prev, classId: selectedClassIdForFetch }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verbatim relocation of original effect
  }, [selectedClassIdForFetch, formAdd.form.classId]);

  const editDelete = useStudentEditDelete({
    availableClasses,
    selectedClassIdForFetch,
    statusFilter,
    patchStudent,
    removeStudent,
    refreshStats,
    onBeforeOpenEdit: () => {
      formAdd.setShowAddForm(false);
      formAdd.setShowUploadPanel(false);
    },
  });

  const exportState = useStudentExport({
    filteredStudents,
    selectedClass,
    selectedSection,
    selectedClassIdForFetch,
    statusFilter,
  });

  return {
    filterClassOptions,
    filterSectionOptions,
    formClassOptions,
    formSectionOptions,
    classesLoading,
    selectedClass,
    setSelectedClass,
    selectedSection,
    setSelectedSection,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    ...formAdd,
    filteredStudents,
    tableLoading: listLoading,
    loadingMore,
    hasMore: false,
    totalCount,
    activeCount,
    inactiveCount,
    selectedClassObj,
    ...editDelete,
    ...exportState,
  };
}
