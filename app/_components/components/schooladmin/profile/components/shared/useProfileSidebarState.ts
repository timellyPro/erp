import { useEffect, useState } from "react";
import {
  ageFromDob,
  toDobDateInputValue,
} from "@/lib/dobCalendar";
import { residencyKind } from "@/lib/fees/residencyConversion";
import type { ConversionPeriod, ConversionPreview } from "../ResidencyConversionModal";
import { residencySelectValue, type ProfileSidebarProps } from "./profileSidebarHelpers";

export function useProfileSidebarState({
  studentId,
  student,
  fatherName = "",
  fatherPhone = "",
  motherName = "",
  motherPhone = "",
  classId = null,
  classes = [],
  gender = "",
  residencyType = "Day Scholar",
  onSaved,
}: ProfileSidebarProps) {
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [parentModalOpen, setParentModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sName, setSName] = useState(student.name);
  const [sEmail, setSEmail] = useState(student.email);
  const [sPhone, setSPhone] = useState(student.phone);
  const [sAddress, setSAddress] = useState(student.address === "—" ? "" : student.address);
  const [sRoll, setSRoll] = useState(student.rollNo);
  const [sDob, setSDob] = useState(() => toDobDateInputValue(student.dob));
  const [sClassId, setSClassId] = useState(classId ?? "");
  const [sGender, setSGender] = useState(gender);
  const [sResidency, setSResidency] = useState(() => residencySelectValue(residencyType));
  const [conversionOpen, setConversionOpen] = useState(false);
  const [conversionPreview, setConversionPreview] = useState<ConversionPreview | null>(null);
  const [conversionTransportKey, setConversionTransportKey] = useState("");
  const [conversionSaving, setConversionSaving] = useState(false);
  const [residencyPeriods, setResidencyPeriods] = useState<ConversionPeriod[]>([]);
  const [residencyYearLabel, setResidencyYearLabel] = useState("");

  const [pFatherName, setPFatherName] = useState(fatherName);
  const [pFatherPhone, setPFatherPhone] = useState(fatherPhone || student.phone || "");
  const [pMotherName, setPMotherName] = useState(motherName);
  const [pMotherPhone, setPMotherPhone] = useState(motherPhone || "");

  useEffect(() => {
    if (studentModalOpen) return;
    setSName(student.name);
    setSEmail(student.email);
    setSPhone(student.phone);
    setSAddress(student.address === "—" ? "" : student.address);
    setSRoll(student.rollNo);
    setSDob(toDobDateInputValue(student.dob));
    setSClassId(classId ?? "");
    setSGender(gender);
    setSResidency(residencySelectValue(residencyType));
  }, [student, classId, gender, residencyType, studentModalOpen]);

  useEffect(() => {
    if (parentModalOpen) return;
    setPFatherName(fatherName);
    setPFatherPhone(fatherPhone || student.phone || "");
    setPMotherName(motherName);
    setPMotherPhone(motherPhone || "");
  }, [fatherName, fatherPhone, motherName, motherPhone, student.phone, parentModalOpen]);

  useEffect(() => {
    if (!studentId.trim()) {
      setResidencyPeriods([]);
      return;
    }
    let cancelled = false;
    void fetch(`/api/student/${encodeURIComponent(studentId)}/residency-conversion`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setResidencyYearLabel(typeof data.academicYearLabel === "string" ? data.academicYearLabel : "");
        setResidencyPeriods(Array.isArray(data.periods) ? data.periods : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [studentId, residencyType]);

  const canEdit = Boolean(studentId.trim());

  const openStudentModal = () => {
    setSName(student.name);
    setSEmail(student.email);
    setSPhone(student.phone);
    setSAddress(student.address === "—" ? "" : student.address);
    setSRoll(student.rollNo);
    setSDob(toDobDateInputValue(student.dob));
    setSClassId(classId ?? "");
    setSGender(gender);
    setSResidency(residencySelectValue(residencyType));
    setStudentModalOpen(true);
  };

  const classOptions = [
    { label: "No class", value: "" },
    ...classes.map((c) => ({ label: c.label, value: c.id })),
  ];

  const saveStudent = async () => {
    if (!canEdit) return;
    const name = sName.trim();
    if (name.length < 2) {
      alert("Name must be at least 2 characters.");
      return;
    }
    const savedResidency = residencySelectValue(sResidency);
    const currentKind = residencyKind(residencyType);
    const nextKind = residencyKind(savedResidency);
    const converting = Boolean(currentKind && nextKind && currentKind !== nextKind);

    setSaving(true);
    try {
      const res = await fetch(`/api/student/${encodeURIComponent(studentId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          email: sEmail.trim(),
          phoneNo: sPhone.trim(),
          address: sAddress.trim() || null,
          rollNo: sRoll.trim() || null,
          classId: sClassId || null,
          gender: sGender.trim() || null,
          dob: sDob.trim() || null,
          ...(converting ? {} : { residencyType: savedResidency }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Update failed");
        return;
      }
      const resolvedClass = classes.find((c) => c.id === sClassId);
      const savedDob = sDob.trim();
      const nextAge = ageFromDob(savedDob);
      const savedName =
        typeof data.student?.name === "string" && data.student.name.trim()
          ? data.student.name.trim()
          : name;
      const savedPatch = {
        name: savedName,
        email: sEmail.trim(),
        phone: sPhone.trim(),
        address: sAddress.trim(),
        rollNo: sRoll.trim(),
        classId: sClassId || null,
        gender: sGender.trim(),
        dob: savedDob,
        ...(nextAge != null ? { age: String(nextAge) } : {}),
        ...(resolvedClass ? { classDisplayName: resolvedClass.label } : {}),
      };

      if (converting && nextKind) {
        const previewRes = await fetch(
          `/api/student/${encodeURIComponent(studentId)}/residency-conversion?to=${encodeURIComponent(nextKind)}`,
          { credentials: "include" }
        );
        const preview = await previewRes.json().catch(() => ({}));
        if (!previewRes.ok) {
          alert(typeof preview.message === "string" ? preview.message : "Could not prepare the fee conversion");
          onSaved?.(savedPatch);
          return;
        }
        setStudentModalOpen(false);
        onSaved?.(savedPatch);
        const initialKey = Array.isArray(preview.periods)
          ? String(
              preview.periods.find(
                (period: { transportKey?: string | null }) => period.transportKey
              )?.transportKey ?? ""
            )
          : "";
        setConversionTransportKey(initialKey);
        setConversionPreview({
          academicYearLabel: String(preview.academicYearLabel ?? ""),
          fromResidency: nextKind === "Hosteller" ? "Day Scholar" : "Hosteller",
          toResidency: nextKind,
          periods: Array.isArray(preview.periods) ? preview.periods : [],
          charges: Array.isArray(preview.charges) ? preview.charges : [],
          transportOptions: Array.isArray(preview.transportOptions) ? preview.transportOptions : [],
          requiresTransportChoice: Boolean(preview.requiresTransportChoice),
        });
        setConversionOpen(true);
        return;
      }

      setStudentModalOpen(false);
      onSaved?.({ ...savedPatch, residencyType: savedResidency });
    } catch {
      alert("Update failed");
    } finally {
      setSaving(false);
    }
  };

  const chooseConversionTransport = async (key: string) => {
    if (!conversionPreview) return;
    setConversionTransportKey(key);
    try {
      const params = new URLSearchParams({ to: conversionPreview.toResidency, transportKey: key });
      const res = await fetch(
        `/api/student/${encodeURIComponent(studentId)}/residency-conversion?${params.toString()}`,
        { credentials: "include" }
      );
      const preview = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setConversionPreview({
        academicYearLabel: String(preview.academicYearLabel ?? conversionPreview.academicYearLabel),
        fromResidency: conversionPreview.fromResidency,
        toResidency: conversionPreview.toResidency,
        periods: Array.isArray(preview.periods) ? preview.periods : conversionPreview.periods,
        charges: Array.isArray(preview.charges) ? preview.charges : conversionPreview.charges,
        transportOptions: Array.isArray(preview.transportOptions)
          ? preview.transportOptions
          : conversionPreview.transportOptions,
        requiresTransportChoice: Boolean(preview.requiresTransportChoice),
      });
    } catch {
      // Keep the previous preview if the slab refresh fails. The confirm request still sends the selected slab.
    }
  };

  const confirmConversion = async () => {
    if (!conversionPreview) return;
    setConversionSaving(true);
    try {
      const res = await fetch(`/api/student/${encodeURIComponent(studentId)}/residency-conversion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          toResidency: conversionPreview.toResidency,
          transportKey: conversionTransportKey || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Conversion failed");
        return;
      }
      setConversionOpen(false);
      setConversionPreview(null);
      if (Array.isArray(data.periods)) setResidencyPeriods(data.periods);
      if (typeof data.academicYearLabel === "string") setResidencyYearLabel(data.academicYearLabel);
      onSaved?.({
        residencyType: typeof data.residencyType === "string" ? data.residencyType : conversionPreview.toResidency,
      });
    } catch {
      alert("Conversion failed");
    } finally {
      setConversionSaving(false);
    }
  };

  const saveParent = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/student/${encodeURIComponent(studentId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fatherName: pFatherName.trim(),
          motherName: pMotherName.trim() || null,
          phoneNo: pFatherPhone.trim(),
          emergencyMotherNo: pMotherPhone.trim() || "-",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Update failed");
        return;
      }
      setParentModalOpen(false);
      onSaved?.({
        fatherName: pFatherName.trim(),
        fatherPhone: pFatherPhone.trim(),
        motherName: pMotherName.trim(),
        motherPhone: pMotherPhone.trim(),
      });
    } catch {
      alert("Update failed");
    } finally {
      setSaving(false);
    }
  };

  return {
    studentModalOpen,
    setStudentModalOpen,
    parentModalOpen,
    setParentModalOpen,
    saving,
    sName,
    setSName,
    sEmail,
    setSEmail,
    sPhone,
    setSPhone,
    sAddress,
    setSAddress,
    sRoll,
    setSRoll,
    sDob,
    setSDob,
    sClassId,
    setSClassId,
    sGender,
    setSGender,
    sResidency,
    setSResidency,
    pFatherName,
    setPFatherName,
    pFatherPhone,
    setPFatherPhone,
    pMotherName,
    setPMotherName,
    pMotherPhone,
    setPMotherPhone,
    canEdit,
    openStudentModal,
    classOptions,
    saveStudent,
    saveParent,
    conversionOpen,
    setConversionOpen,
    conversionPreview,
    setConversionPreview,
    conversionTransportKey,
    conversionSaving,
    residencyPeriods,
    residencyYearLabel,
    chooseConversionTransport,
    confirmConversion,
  };
}
