"use client";

import { useState } from "react";
import { addStudent } from "../../../../services/student.service";
import { toast } from "../../../../services/toast.service";
import { StudentFormErrors, StudentFormState, StudentStatusFilter } from "../types";
import { formatStudentMessage, validateForm } from "./validation";
import { DEFAULT_FORM } from "./defaults";

export default function useStudentFormAdd({
  statusFilter,
  refreshStats,
  refreshList,
}: {
  statusFilter: StudentStatusFilter;
  refreshStats: () => Promise<void>;
  refreshList: (silent?: boolean) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<StudentFormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<StudentFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleFormChange = (key: keyof StudentFormState, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [key]: value } as StudentFormState));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleResetForm = () => {
    setForm({ ...DEFAULT_FORM });
    setErrors({});
  };

  const handleSaveStudent = async () => {
    const nextErrors = validateForm(form, {
      requireAadhaar: true,
      requirePhone: true,
      requireClass: true,
      requireGender: true,
      strictOptionalFormats: true,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const aadhaarDigits = form.aadhaarNo.replace(/\D/g, "");
    const phoneDigits = form.phoneNo.replace(/\D/g, "");

    try {
      setSaving(true);
      const classIdPayload = form.classId?.trim() ? form.classId.trim() : undefined;
      const res: Response = await addStudent({
        name: form.name.trim(),
        fatherName: form.fatherName.trim(),
        motherName: form.motherName?.trim() || undefined,
        occupation: form.occupation?.trim() || undefined,
        aadhaarNo: aadhaarDigits,
        phoneNo: phoneDigits,
        /** Parent/guardian contact only — student login email is always auto-generated on the server */
        email: form.email.trim() || undefined,
        parentEmail: form.email.trim() || undefined,
        dob: form.dob,
        classId: classIdPayload,
        address: form.address?.trim() || undefined,
        rollNo: form.rollNo?.trim() || undefined,
        penNumber: form.penNumber?.trim() || undefined,
        apaarId: form.apaarId?.trim() || undefined,
        gender: form.gender?.trim() || undefined,
        residencyType: form.residencyType?.trim() || "Day Scholar",
        status: form.status || "Active",
        subjects: Array.isArray(form.subjects) ? form.subjects : [],
      });

      const data = await res.json();

      if (!res.ok) {
        const rawMessage = typeof data.message === "string" ? data.message : "";
        const lowerRaw = rawMessage.toLowerCase();
        const message = formatStudentMessage(rawMessage || "Failed to add student");

        // Use raw API text for classification: formatted `message` can match the generic
        // "timelly id already exists" substring even for the name+ID combined error.
        if (lowerRaw.includes("student name and timelly id already exist")) {
          setErrors((prev) => ({
            ...prev,
            name: "Already exist.",
            rollNo: "Already exist.",
          }));
        } else if (
          lowerRaw.includes("timelly id already exists") ||
          lowerRaw.includes("timelly id is already used")
        ) {
          setErrors((prev) => ({ ...prev, rollNo: "Already exist." }));
        }

        toast.error(message);
        return;
      }

      // Student is already created with classId in the create API, so no need for separate assignment
      toast.success("Student added successfully");
      setShowSuccess(true);
      setForm({ ...DEFAULT_FORM, classId: form.classId });
      setShowAddForm(false);
      void refreshStats();
      if (form.status !== "Inactive" && statusFilter !== "Inactive") {
        void refreshList(true);
      }
    } catch (e) {
      const message =
        e instanceof Error && e.message
          ? e.message
          : "Something went wrong while adding student";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      const message = "Please select an Excel/CSV file";
      toast.error(message);
      throw new Error(message);
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("file", uploadFile);

      const uploadRes = await fetch("/api/student/bulk-upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        const message = formatStudentMessage(uploadData.message || "Upload failed");
        toast.error(message);
        throw new Error(message);
      }

      if ((uploadData.createdCount || 0) === 0 && (uploadData.failedCount || 0) > 0) {
        const firstFailed =
          Array.isArray(uploadData.failed) && uploadData.failed.length > 0
            ? uploadData.failed[0]
            : null;
        const message = firstFailed?.error
          ? `Upload failed at row ${firstFailed.row}: ${formatStudentMessage(firstFailed.error)}`
          : "Upload failed. No students were created.";
        toast.error(message);
        throw new Error(message);
      }

      toast.success(
        `${uploadData.createdCount || 0} students added successfully`
      );
      setUploadFile(null);
      void refreshStats();
      void refreshList(true);
      return {
        createdCount: uploadData.createdCount || 0,
        failedCount: uploadData.failedCount || 0,
        failed: Array.isArray(uploadData.failed) ? uploadData.failed : [],
      };
    } catch (e) {
      if (e instanceof Error) {
        throw e;
      }
      throw new Error("Something went wrong. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return {
    showAddForm,
    setShowAddForm,
    showUploadPanel,
    setShowUploadPanel,
    uploadFile,
    setUploadFile,
    uploading,
    handleUpload,
    form,
    setForm,
    errors,
    saving,
    handleFormChange,
    handleResetForm,
    handleSaveStudent,
    showSuccess,
    setShowSuccess,
  };
}
