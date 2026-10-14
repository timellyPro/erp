"use client";

import { useState } from "react";
import { updateStudent, deleteStudent as deleteStudentApi } from "../../../../services/student.service";
import { toast } from "../../../../services/toast.service";
import { ClassItem, StudentFormErrors, StudentFormState, StudentRow, StudentStatusFilter } from "../types";
import { mergeStudentAfterEdit, toStudentForm } from "../utils";
import { invalidateStudentDetailsFast as invalidateStudentDetailsBundleCache } from "@/lib/students/fetchStudentDetailsFast";
import { clearStudentListCache } from "@/lib/students/studentListSessionCache";
import { validateForm } from "./validation";
import { DEFAULT_FORM } from "./defaults";

export default function useStudentEditDelete({
  availableClasses,
  selectedClassIdForFetch,
  statusFilter,
  patchStudent,
  removeStudent,
  refreshStats,
  onBeforeOpenEdit,
}: {
  availableClasses: ClassItem[];
  selectedClassIdForFetch: string;
  statusFilter: StudentStatusFilter;
  patchStudent: (studentId: string, updater: (row: StudentRow) => StudentRow) => void;
  removeStudent: (studentId: string) => void;
  refreshStats: () => Promise<void>;
  onBeforeOpenEdit?: () => void;
}) {
  const [viewStudent, setViewStudent] = useState<StudentRow | null>(null);
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [deleteStudent, setDeleteStudent] = useState<StudentRow | null>(null);
  const [editForm, setEditForm] = useState<StudentFormState>(DEFAULT_FORM);
  const [editErrors, setEditErrors] = useState<StudentFormErrors>({});
  const [editSaving, setEditSaving] = useState(false);

  const handleEditChange = (key: keyof StudentFormState, value: string | string[]) => {
    setEditForm((prev) => ({ ...prev, [key]: value } as StudentFormState));
    setEditErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const openView = (student: StudentRow) => setViewStudent(student);

  const openEdit = (student: StudentRow) => {
    onBeforeOpenEdit?.();
    setEditStudent(student);
    setEditForm(toStudentForm(student));
    setEditErrors({});
    void (async () => {
      try {
        const res = await fetch(`/api/student/${encodeURIComponent(student.id)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.student) return;
        setEditForm((prev) => ({
          ...prev,
          name: data.student.name || prev.name,
          rollNo: data.student.rollNo || prev.rollNo,
          penNumber: data.student.penNumber || prev.penNumber,
          apaarId: data.student.apaarId || prev.apaarId,
          gender: data.student.gender || prev.gender,
          residencyType: data.student.residencyType || prev.residencyType,
          dob: data.student.dob || prev.dob,
          classId: data.student.class?.id || prev.classId,
          section: data.student.class?.section || prev.section,
          fatherName: data.student.fatherName || prev.fatherName,
          motherName: data.student.motherName || prev.motherName,
          occupation: data.student.fatherOccupation || prev.occupation,
          officeAddress: data.student.officeAddress || prev.officeAddress,
          phoneNo: data.student.phone || prev.phoneNo,
          email: data.student.parentEmail || data.student.email || prev.email,
          address: data.student.address || prev.address,
          aadhaarNo: data.student.aadhaarNo || prev.aadhaarNo,
          parentAadharNo: data.student.parentAadharNo || prev.parentAadharNo,
          parentWhatsapp: data.student.parentWhatsapp || prev.parentWhatsapp,
          bankAccountNo: data.student.bankAccountNo || prev.bankAccountNo,
          applicationFee:
            data.student.applicationFee != null
              ? String(data.student.applicationFee)
              : prev.applicationFee,
          admissionFee:
            data.student.admissionFee != null ? String(data.student.admissionFee) : prev.admissionFee,
          previousSchool: data.student.previousSchool || prev.previousSchool,
          houseNo: data.student.houseNo || prev.houseNo,
          street: data.student.street || prev.street,
          city: data.student.city || prev.city,
          town: data.student.town || prev.town,
          state: data.student.state || prev.state,
          pinCode: data.student.pinCode || prev.pinCode,
          nationality: data.student.nationality || prev.nationality,
          languagesAtHome: data.student.languagesAtHome || prev.languagesAtHome,
          caste: data.student.caste || prev.caste,
          religion: data.student.religion || prev.religion,
          emergencyFatherNo: data.student.emergencyFatherNo || prev.emergencyFatherNo,
          emergencyMotherNo: data.student.emergencyMotherNo || prev.emergencyMotherNo,
          emergencyGuardianNo: data.student.emergencyGuardianNo || prev.emergencyGuardianNo,
          status: data.student.status || prev.status,
          subjects: Array.isArray(data.student.subjects) ? data.student.subjects : prev.subjects,
        }));
      } catch {
        // keep defaults from list row
      }
    })();
  };

  const openDelete = (student: StudentRow) => setDeleteStudent(student);

  const closeView = () => setViewStudent(null);
  const closeEdit = () => setEditStudent(null);
  const closeDelete = () => setDeleteStudent(null);

  const handleEditSave = async () => {
    if (!editStudent) return;
    const nextErrors = validateForm(editForm, {
      requireAadhaar: false,
      requirePhone: false,
    });
    setEditErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setEditSaving(true);
    try {
      const res = await updateStudent(editStudent.id, {
        name: editForm.name.trim(),
        fatherName: editForm.fatherName.trim(),
        motherName: editForm.motherName.trim() || undefined,
        occupation: editForm.occupation.trim() || undefined,
        classId: editForm.classId || undefined,
        dob: editForm.dob || undefined,
        aadhaarNo: editForm.aadhaarNo.trim() || undefined,
        rollNo: editForm.rollNo.trim() || undefined,
        penNumber: editForm.penNumber.trim() || undefined,
        apaarId: editForm.apaarId.trim() || undefined,
        phoneNo: editForm.phoneNo.trim() || undefined,
        email: editForm.email.trim() || undefined,
        address: editForm.address.trim() || undefined,
        gender: editForm.gender.trim() || undefined,
        residencyType: editForm.residencyType?.trim() || "Day Scholar",
        parentAadharNo: editForm.parentAadharNo.trim() || undefined,
        parentWhatsapp: editForm.parentWhatsapp.trim() || undefined,
        bankAccountNo: editForm.bankAccountNo.trim() || undefined,
        officeAddress: editForm.officeAddress.trim() || undefined,
        houseNo: editForm.houseNo.trim() || undefined,
        street: editForm.street.trim() || undefined,
        city: editForm.city.trim() || undefined,
        town: editForm.town.trim() || undefined,
        state: editForm.state.trim() || undefined,
        pinCode: editForm.pinCode.trim() || undefined,
        nationality: editForm.nationality.trim() || undefined,
        languagesAtHome: editForm.languagesAtHome.trim() || undefined,
        caste: editForm.caste.trim() || undefined,
        religion: editForm.religion.trim() || undefined,
        emergencyFatherNo: editForm.emergencyFatherNo.trim() || undefined,
        emergencyMotherNo: editForm.emergencyMotherNo.trim() || undefined,
        emergencyGuardianNo: editForm.emergencyGuardianNo.trim() || undefined,
        applicationFee: editForm.applicationFee.trim()
          ? Number(editForm.applicationFee)
          : null,
        admissionFee: editForm.admissionFee.trim() ? Number(editForm.admissionFee) : null,
        status: editForm.status || "Active",
        subjects: Array.isArray(editForm.subjects) ? editForm.subjects : [],
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to update student");
        return;
      }

      const resolvedClass = editForm.classId
        ? availableClasses.find((c) => c.id === editForm.classId) ?? null
        : null;
      const updated = mergeStudentAfterEdit(editStudent, editForm, resolvedClass);
      const updatedClassId = updated.class?.id;
      const becameInactive = (updated.status || "Active") === "Inactive";
      const becameActive = (updated.status || "Active") === "Active";

      const movedOutOfFilteredClass =
        Boolean(selectedClassIdForFetch) &&
        Boolean(updatedClassId) &&
        updatedClassId !== selectedClassIdForFetch;

      const shouldRemoveFromList =
        (statusFilter === "Active" && becameInactive) ||
        (statusFilter === "Inactive" && becameActive) ||
        movedOutOfFilteredClass;

      if (shouldRemoveFromList) {
        removeStudent(editStudent.id);
      } else {
        patchStudent(editStudent.id, () => updated);
      }

      if (becameInactive || becameActive) {
        invalidateStudentDetailsBundleCache(editStudent.id);
        clearStudentListCache();
      }

      toast.success(
        becameInactive
          ? "Student marked inactive. They no longer appear in class lists or portal."
          : typeof data.message === "string" && data.message
            ? data.message
            : "Student updated successfully"
      );
      closeEdit();

      void refreshStats();
    } catch {
      toast.error("Failed to update student");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteStudent) return;
    const student = deleteStudent;
    try {
      const res = await deleteStudentApi(student.id);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to delete student");
        return;
      }
      toast.success("Student deleted successfully");
      closeDelete();
      removeStudent(student.id);
      void refreshStats();
    } catch {
      toast.error("Failed to delete student");
    }
  };

  return {
    viewStudent,
    editStudent,
    deleteStudent,
    editForm,
    setEditForm,
    editErrors,
    editSaving,
    handleEditChange,
    openView,
    openEdit,
    openDelete,
    closeView,
    closeEdit,
    closeDelete,
    handleEditSave,
    handleDelete,
  };
}
