"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Users, Mail, Phone, MapPin, Pencil, X, CircleDollarSign } from "lucide-react";
import SelectInput from "../../../common/SelectInput";
import { formatStoredAddressForDisplay } from "@/lib/studentAddressFormat";
import {
  canonicalizeResidencyType,
  formatResidencyTypeForDisplay,
} from "@/lib/residencyDisplay";

const RESIDENCY_OPTIONS = [
  { label: "Day Scholar", value: "Day Scholar" },
  { label: "Hostel", value: "Hosteller" },
  { label: "RTE", value: "RTE" },
] as const;

function residencySelectValue(value?: string | null): string {
  return canonicalizeResidencyType(value);
}

const getResidencyLabel = (value?: string) => {
  const raw = (value || "").trim();
  if (!raw) return "Day Scholar";
  return formatResidencyTypeForDisplay(raw);
};

interface StudentProfileProps {
  name: string;
  id: string;
  className: string;
  rollNo: string;
  age: string;
  email: string;
  phone: string;
  address: string;
  photoUrl?: string | null;
}

type Props = {
  studentId: string;
  student: StudentProfileProps;
  fatherName?: string;
  fatherPhone?: string;
  motherName?: string;
  motherPhone?: string;
  classId?: string | null;
  classes?: { id: string; label: string }[];
  gender?: string;
  residencyType?: string;
  onSaved?: (patch?: {
    fatherName?: string;
    fatherPhone?: string;
    motherName?: string;
    motherPhone?: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    rollNo?: string;
    classId?: string | null;
    classDisplayName?: string;
    gender?: string;
    residencyType?: string;
  }) => void;
  onOpenFees?: () => void;
  /** Warm fee breakdown before the user opens the fees sheet. */
  onFeesHover?: () => void;
  /** When true, fees sheet and payment actions are disabled (inactive student). */
  feesRecordingDisabled?: boolean;
};

export const ProfileSidebar = ({
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
  onOpenFees,
  onFeesHover,
  feesRecordingDisabled = false,
}: Props) => {
  const normalizedAddress = formatStoredAddressForDisplay(student.address || "");

  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [parentModalOpen, setParentModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sName, setSName] = useState(student.name);
  const [sEmail, setSEmail] = useState(student.email);
  const [sPhone, setSPhone] = useState(student.phone);
  const [sAddress, setSAddress] = useState(student.address === "—" ? "" : student.address);
  const [sRoll, setSRoll] = useState(student.rollNo);
  const [sClassId, setSClassId] = useState(classId ?? "");
  const [sGender, setSGender] = useState(gender);
  const [sResidency, setSResidency] = useState(() => residencySelectValue(residencyType));

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

  const canEdit = Boolean(studentId.trim());

  const openStudentModal = () => {
    setSName(student.name);
    setSEmail(student.email);
    setSPhone(student.phone);
    setSAddress(student.address === "—" ? "" : student.address);
    setSRoll(student.rollNo);
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
          residencyType: residencySelectValue(sResidency),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Update failed");
        return;
      }
      setStudentModalOpen(false);
      const resolvedClass = classes.find((c) => c.id === sClassId);
      const savedResidency = residencySelectValue(sResidency);
      onSaved?.({
        name,
        email: sEmail.trim(),
        phone: sPhone.trim(),
        address: sAddress.trim(),
        rollNo: sRoll.trim(),
        classId: sClassId || null,
        gender: sGender.trim(),
        residencyType: savedResidency,
        ...(resolvedClass
          ? {
              classDisplayName: resolvedClass.label,
            }
          : {}),
      });
    } catch {
      alert("Update failed");
    } finally {
      setSaving(false);
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4 min-w-0 w-full">
      {/* Student Identity Card */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 shadow-lg text-left min-w-0 w-full">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Student</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={feesRecordingDisabled ? undefined : onOpenFees}
              onMouseEnter={feesRecordingDisabled ? undefined : onFeesHover}
              onFocus={feesRecordingDisabled ? undefined : onFeesHover}
              disabled={feesRecordingDisabled}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-blue-300 hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              title={feesRecordingDisabled ? "Inactive students — fees cannot be recorded" : "Open fees sheet"}
            >
              <CircleDollarSign className="h-3.5 w-3.5" strokeWidth={2.25} />
              Fees
            </button>
            <button
              type="button"
              onClick={openStudentModal}
              disabled={!canEdit}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-lime-500/40 bg-lime-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-lime-300 hover:bg-lime-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              title="Edit student details"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
              Edit
            </button>
          </div>
        </div>

        <div className="flex gap-3 mb-3">
          <div className="relative w-[4.5rem] h-[4.5rem] shrink-0">
            <img
              src={student.photoUrl || "/avatar.jpg"}
              className="rounded-2xl border-2 border-[#b4f44d]/90 object-cover w-full h-full shadow-md"
              alt={student.name}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Name</p>
            <p className="text-sm font-bold text-white break-words leading-snug">{student.name}</p>
            <p className="text-[11px] text-[#b4f44d] font-mono break-all mt-1 opacity-90" title={student.id}>
              {student.id}
            </p>
          </div>
        </div>

        <div className="mb-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Type</p>
          <p className="text-xs font-semibold text-white">{getResidencyLabel(residencyType)}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3">
          <div className="bg-white/5 py-2 px-2 sm:px-2.5 rounded-xl border border-white/5 min-w-0 text-center">
            <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Class</p>
            <p className="text-[11px] sm:text-xs font-bold text-white break-words leading-tight" title={student.className}>
              {student.className}
            </p>
          </div>
          <div className="bg-white/5 py-2 px-2 sm:px-2.5 rounded-xl border border-white/5 min-w-0 text-center">
            <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Roll</p>
            <p className="text-[11px] sm:text-xs font-bold text-white break-words leading-tight">{student.rollNo || "—"}</p>
          </div>
          <div className="bg-white/5 py-2 px-2 sm:px-2.5 rounded-xl border border-white/5 min-w-0 text-center">
            <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Age</p>
            <p className="text-[11px] sm:text-xs font-bold text-white">{student.age}</p>
          </div>
        </div>

        <div className="space-y-2 pt-3 border-t border-white/5 text-xs text-gray-300">
          <div className="flex items-start gap-2.5 min-w-0">
            <Mail size={14} className="text-[#b4f44d] shrink-0 mt-0.5" />
            <span className="break-all line-clamp-2 min-w-0">{student.email || "—"}</span>
          </div>
          <div className="flex items-start gap-2.5 min-w-0">
            <Phone size={14} className="text-[#b4f44d] shrink-0 mt-0.5" />
            <span className="break-all">{student.phone || "—"}</span>
          </div>
          <div className="flex items-start gap-2.5 min-w-0">
            <MapPin size={14} className="text-[#b4f44d] shrink-0 mt-0.5" />
            <span className="leading-snug line-clamp-4 break-words">{normalizedAddress || "—"}</span>
          </div>
        </div>
      </div>

      {/* Parent Details Card */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 shadow-lg min-w-0 w-full">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h4 className="text-[#b4f44d] font-bold flex items-center gap-2 text-sm min-w-0">
            <Users className="w-5 h-5 shrink-0" /> Parents Details
          </h4>
          <button
            type="button"
            onClick={() => setParentModalOpen(true)}
            disabled={!canEdit}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-lime-500/40 bg-lime-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-lime-300 hover:bg-lime-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            title="Edit parent / guardian details"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
            Edit
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-white/5 bg-white/5 p-2.5">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter mb-1.5">Father / Guardian</p>
            <p className="text-xs font-bold text-white break-words">{fatherName || "Not Provided"}</p>
            <p className="text-[11px] text-gray-400 mt-1">{fatherPhone || "—"}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 p-2.5">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter mb-1.5">Mother</p>
            <p className="text-xs font-bold text-white break-words">{motherName || "Not Provided"}</p>
            <p className="text-[11px] text-gray-400 mt-1">{motherPhone || "—"}</p>
          </div>
        </div>
      </div>

      {studentModalOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-student-sidebar-title"
        >
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h4 id="edit-student-sidebar-title" className="text-lg font-semibold text-white">
                Edit student details
              </h4>
              <button
                type="button"
                onClick={() => !saving && setStudentModalOpen(false)}
                className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Full name</label>
                <input
                  value={sName}
                  onChange={(e) => setSName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Email (login)</label>
                <input
                  type="email"
                  value={sEmail}
                  onChange={(e) => setSEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Phone</label>
                <input
                  value={sPhone}
                  onChange={(e) => setSPhone(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Address</label>
                <textarea
                  value={sAddress}
                  onChange={(e) => setSAddress(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white resize-y min-h-[4rem]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Roll number</label>
                <input
                  value={sRoll}
                  onChange={(e) => setSRoll(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Class</label>
                <SelectInput
                  value={sClassId}
                  onChange={(v) => setSClassId(v)}
                  options={classOptions}
                  bgColor="black"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Gender</label>
                <input
                  value={sGender}
                  onChange={(e) => setSGender(e.target.value)}
                  placeholder="e.g. Male, Female"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Residency</label>
                <SelectInput
                  value={sResidency}
                  onChange={setSResidency}
                  options={[...RESIDENCY_OPTIONS]}
                  bgColor="black"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !saving && setStudentModalOpen(false)}
                disabled={saving}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveStudent}
                disabled={saving}
                className="rounded-xl bg-lime-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {parentModalOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-parent-sidebar-title"
        >
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h4 id="edit-parent-sidebar-title" className="text-lg font-semibold text-white">
                Edit parent details
              </h4>
              <button
                type="button"
                onClick={() => !saving && setParentModalOpen(false)}
                className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
              Update only parent names and mobile numbers here.
            </p>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Father / guardian name</label>
                <input
                  value={pFatherName}
                  onChange={(e) => setPFatherName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Guardian phone</label>
                <input
                  value={pFatherPhone}
                  onChange={(e) => setPFatherPhone(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Mother name</label>
                <input
                  value={pMotherName}
                  onChange={(e) => setPMotherName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Mother phone</label>
                <input
                  value={pMotherPhone}
                  onChange={(e) => setPMotherPhone(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !saving && setParentModalOpen(false)}
                disabled={saving}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveParent}
                disabled={saving}
                className="rounded-xl bg-lime-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
};
