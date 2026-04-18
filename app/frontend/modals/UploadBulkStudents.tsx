import { useState } from "react";
import { toast } from "../services/toast.service";
import { assignStudentsToClass } from "../services/student.service";
import { PRIMARY_COLOR } from "../constants/colors";
import { downloadBulkStudentTemplateXlsx } from "@/lib/bulkStudentTemplateXlsx";

export default function UploadCSVModal({ classId, onClose, onSuccess }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDownloadTemplate = () => {
    downloadBulkStudentTemplateXlsx();
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a CSV or Excel file");
      return;
    }

    try {
      setLoading(true);

      /* ================= 1.BULK UPLOAD ================= */

      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/student/bulk-upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        toast.error(uploadData.message || "Bulk upload failed");
        return;
      }

      if (!uploadData.createdCount) {
        const firstError =
          Array.isArray(uploadData.failed) && uploadData.failed.length > 0
            ? uploadData.failed[0]
            : null;
        toast.error(
          firstError?.error
            ? `Upload failed at row ${firstError.row}: ${firstError.error}`
            : "No students were created from the uploaded file"
        );
        return;
      }

      if (uploadData.failedCount > 0) {
        const firstError =
          Array.isArray(uploadData.failed) && uploadData.failed.length > 0
            ? uploadData.failed[0]
            : null;
        toast.error(
          firstError?.error
            ? `${uploadData.createdCount} created, ${uploadData.failedCount} failed. First error at row ${firstError.row}: ${firstError.error}`
            : `${uploadData.createdCount} created, ${uploadData.failedCount} failed`
        );
      }

      /* ================= 2.FETCH UNASSIGNED STUDENTS (FIX) ================= */

      const studentsRes = await fetch("/api/student/list", { credentials: "include" });
      const studentsData = await studentsRes.json();

      if (!studentsRes.ok || !Array.isArray(studentsData.students)) {
        toast.error("Failed to fetch students");
        return;
      }

      // Filter only unassigned students (file may have assigned some via class/section)
      const unassignedStudents = studentsData.students.filter(
        (student: any) => !student.class
      );

      if (unassignedStudents.length === 0) {
        // All uploaded students were already assigned (e.g. via class/section in file)
        if (uploadData.createdCount > 0) {
          toast.success(
            `${uploadData.createdCount} students added & assigned successfully`
          );
          onSuccess();
          onClose();
        } else {
          toast.error("No unassigned students found");
        }
        return;
      }

      /* ================= 3.ASSIGN TO CLASS ================= */

      for (const student of unassignedStudents) {
        const assignRes = await assignStudentsToClass(
          student.id,
          classId
        );

        const assignData = await assignRes.json();

        if (!assignRes.ok) {
          toast.error(
            assignData.message ||
              `Failed to assign student ${student.user?.name || ""}`
          );
          return;
        }
      }

      /* ================= SUCCESS ================= */

      toast.success(
        `${uploadData.createdCount} students added & assigned successfully`
      );

      onSuccess();
      onClose();
    } catch (err) {
      toast.error("Something went wrong during bulk upload");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl w-[400px]">
        <h3 className="font-semibold mb-2">Upload Students CSV / Excel</h3>
        <p className="text-xs text-gray-500 mb-3">
          Tuition is calculated from the admin global fee structure for the student&apos;s class (plus extra fees), not from this file. Use the same columns as the admission export, with an optional leading{" "}
          <span className="font-medium">Timelly ID</span> column (plain roll number, or values like{" "}
          <span className="font-mono">ADM/2026/123</span> where the last segment is used). Required fields include{" "}
          <span className="font-medium">First Name</span>, <span className="font-medium">Last Name</span>,{" "}
          <span className="font-medium">Parent Name</span>, <span className="font-medium">Parent Phone</span>,{" "}
          <span className="font-medium">Aadhar No</span>, and <span className="font-medium">Date of Birth</span>. If{" "}
          <span className="font-medium">Parent Email</span> is empty, the system generates{" "}
          <span className="font-mono">studentname@schoolprefix</span>. Password is the DOB in{" "}
          <span className="font-mono">YYYYMMDD</span> format.
        </p>

        <div className="flex flex-col gap-2">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="border border-gray-300 rounded-lg px-3 py-2 w-full"
          />
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="self-start text-xs text-blue-600 hover:underline"
          >
            Download Excel template
          </button>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="border px-4 py-2 rounded border-gray-300">
            Cancel
          </button>

          <button
            onClick={handleUpload}
            disabled={loading}
            style={{ backgroundColor: PRIMARY_COLOR }}
            className="text-white px-4 py-2 rounded disabled:opacity-60"
          >
            {loading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
