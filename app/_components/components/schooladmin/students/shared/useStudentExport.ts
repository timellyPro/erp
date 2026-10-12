"use client";

import { useState } from "react";
import { toast } from "../../../../services/toast.service";
import { StudentRow, StudentStatusFilter } from "../types";
import { downloadStudentListPdf } from "@/lib/students/studentListPdf";

export default function useStudentExport({
  filteredStudents,
  selectedClass,
  selectedSection,
  selectedClassIdForFetch,
  statusFilter,
}: {
  filteredStudents: StudentRow[];
  selectedClass: string;
  selectedSection: string;
  selectedClassIdForFetch: string;
  statusFilter: StudentStatusFilter;
}) {
  const [exportingDetails, setExportingDetails] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const buildExportParams = () => {
    const params = new URLSearchParams();
    if (selectedClassIdForFetch) {
      params.set("classId", selectedClassIdForFetch);
    } else {
      if (selectedClass) params.set("className", selectedClass);
      if (selectedSection) params.set("section", selectedSection);
    }
    if (statusFilter !== "All") {
      params.set("status", statusFilter);
    }
    return params;
  };

  const handleDownloadExcel = async () => {
    if (exportingDetails) return;
    setExportingDetails(true);
    try {
      const res = await fetch(
        `/api/student/export-details?${buildExportParams().toString()}`,
        { credentials: "include", cache: "no-store" }
      );
      if (!res.ok) {
        let message = "Export failed";
        try {
          const data = (await res.json()) as { message?: string };
          if (typeof data.message === "string" && data.message) {
            message = data.message;
          }
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
      a.download =
        statusFilter === "Inactive"
          ? "Inactive-students-report.xlsx"
          : "Student-details-report.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Excel report downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExportingDetails(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (exportingPdf) return;
    if (!filteredStudents.length) {
      toast.error("No students to export");
      return;
    }
    setExportingPdf(true);
    try {
      const schoolRes = await fetch("/api/school/mine", {
        credentials: "include",
        cache: "no-store",
      });
      const schoolPayload = await schoolRes.json().catch(() => ({}));
      const statusLabel =
        statusFilter === "All" ? "All Students" : `${statusFilter} Students`;
      const classLabel = selectedClass
        ? `Class ${selectedClass}${selectedSection ? ` ${selectedSection}` : ""}`
        : "All Classes";
      await downloadStudentListPdf({
        students: filteredStudents,
        title: `${statusLabel} (${filteredStudents.length})`,
        subtitle: classLabel,
        filename: `students-${statusFilter.toLowerCase()}.pdf`,
        school: schoolPayload?.school as {
          name?: string;
          address?: string;
          location?: string;
          affiliationLine?: string;
          logoUrl?: string | null;
          admins?: Array<{ photoUrl?: string | null }>;
        },
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("PDF export failed");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDownloadReport = handleDownloadExcel;

  return {
    exportingDetails,
    exportingPdf,
    handleDownloadReport,
    handleDownloadExcel,
    handleDownloadPdf,
  };
}
