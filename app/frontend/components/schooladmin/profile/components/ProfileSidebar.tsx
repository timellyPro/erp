"use client";

import { useEffect, useState } from "react";
import { Users, Mail, Phone, MapPin, Bookmark, Pencil, X } from "lucide-react";
import SelectInput from "../../../common/SelectInput";

const getResidencyLabel = (value?: string) => {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return "Day Scholar";
  if (normalized.includes("host")) return "Hosteller";
  if (normalized.includes("day")) return "Day Scholar";
  return value || "Day Scholar";
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
  fatherOccupation?: string;
  fatherPhone?: string;
  motherName?: string;
  classId?: string | null;
  classes?: { id: string; label: string }[];
  gender?: string;
  residencyType?: string;
  onSaved?: () => void;
};

export const ProfileSidebar = ({
  studentId,
  student,
  fatherName = "",
  fatherOccupation = "",
  fatherPhone = "",
  motherName = "",
  classId = null,
  classes = [],
  gender = "",
  residencyType = "Day Scholar",
  onSaved,
}: Props) => {
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
  const [sResidency, setSResidency] = useState(residencyType || "Day Scholar");

  const [pFatherName, setPFatherName] = useState(fatherName);
  const [pFatherPhone, setPFatherPhone] = useState(fatherPhone || student.phone || "");
  const [pOccupation, setPOccupation] = useState(fatherOccupation);
  const [pMotherName, setPMotherName] = useState(motherName);

  useEffect(() => {
    if (studentModalOpen) return;
    setSName(student.name);
    setSEmail(student.email);
    setSPhone(student.phone);
    setSAddress(student.address === "—" ? "" : student.address);
    setSRoll(student.rollNo);
    setSClassId(classId ?? "");
    setSGender(gender);
    setSResidency(residencyType || "Day Scholar");
  }, [student, classId, gender, residencyType, studentModalOpen]);

  useEffect(() => {
    if (parentModalOpen) return;
    setPFatherName(fatherName);
    setPFatherPhone(fatherPhone || student.phone || "");
    setPOccupation(fatherOccupation);
    setPMotherName(motherName);
  }, [fatherName, fatherPhone, fatherOccupation, motherName, student.phone, parentModalOpen]);

  const canEdit = Boolean(studentId.trim());

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
          residencyType: sResidency.trim() || "Day Scholar",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Update failed");
        return;
      }
      setStudentModalOpen(false);
      onSaved?.();
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
          occupation: pOccupation.trim() || null,
          phoneNo: pFatherPhone.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Update failed");
        return;
      }
      setParentModalOpen(false);
      onSaved?.();
    } catch {
      alert("Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {/* Student Identity Card */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-4 sm:p-5 text-center shadow-xl">
        <div className="flex items-center justify-between gap-2 mb-3 text-left">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Student</span>
          <button
            type="button"
            onClick={() => setStudentModalOpen(true)}
            disabled={!canEdit}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-lime-500/40 bg-lime-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-lime-300 hover:bg-lime-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            title="Edit student details"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
            Edit
          </button>
        </div>
        <div className="relative w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-4 sm:mb-6">
          <img
            src={student.photoUrl || "/avatar.jpg"}
            className="rounded-[2rem] border-2 border-[#b4f44d] object-cover w-full h-full shadow-lg"
            alt={student.name}
          />
          <span className="absolute -bottom-2 -right-2 bg-[#b4f44d] text-[#2d243a] p-2 rounded-xl shadow-md">
            <Bookmark size={16} fill="currentColor" />
          </span>
        </div>

        <h3 className="text-xl sm:text-2xl font-bold text-white mb-1 break-words px-1">{student.name}</h3>
        <p className="text-[#b4f44d] text-xs sm:text-sm font-mono tracking-widest mb-6 sm:mb-8 uppercase opacity-80 break-all px-1">
          {student.id}
        </p>

        <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left">
          <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-tighter inline-flex items-center gap-1.5">
            <Bookmark size={12} className="text-[#b4f44d]" />
            Type
          </p>
          <p className="text-xs sm:text-sm font-bold text-white">{getResidencyLabel(residencyType)}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 sm:mb-8">
          <div className="bg-white/5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-white/5 min-w-0 px-1">
            <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Class</p>
            <p
              className="text-xs sm:text-sm font-bold text-white break-words whitespace-normal leading-snug"
              title={student.className}
            >
              {student.className}
            </p>
          </div>
          <div className="bg-white/5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-white/5 min-w-0 px-1">
            <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Roll No</p>
            <p className="text-xs sm:text-sm font-bold text-white truncate">{student.rollNo}</p>
          </div>
          <div className="bg-white/5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-white/5 min-w-0 px-1">
            <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Age</p>
            <p className="text-xs sm:text-sm font-bold text-white">{student.age}</p>
          </div>
        </div>

        <div className="text-left space-y-3 pt-4 sm:pt-6 border-t border-white/5">
          <div className="flex items-start gap-3 text-gray-300 min-w-0">
            <div className="rounded-lg flex-shrink-0 mt-0.5">
              <Mail size={16} className="text-[#b4f44d]" />
            </div>
            <span className="text-xs sm:text-sm break-all min-w-0">{student.email}</span>
          </div>
          <div className="flex items-start gap-3 text-gray-300 min-w-0">
            <div className="rounded-lg flex-shrink-0 mt-0.5">
              <Phone size={16} className="text-[#b4f44d]" />
            </div>
            <span className="text-xs sm:text-sm break-all">{student.phone}</span>
          </div>
          <div className="flex items-start gap-3 text-gray-300 min-w-0">
            <div className="rounded-lg flex-shrink-0 mt-0.5">
              <MapPin size={16} className="text-[#b4f44d]" />
            </div>
            <span className="text-xs sm:text-sm leading-snug break-words">{student.address}</span>
          </div>
        </div>
      </div>

      {/* Parent Details Card */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-4 shadow-xl min-w-0">
        <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
          <h4 className="text-[#b4f44d] font-bold flex items-center gap-2 sm:gap-3 text-base sm:text-lg min-w-0">
            <Users className="w-6 h-6 shrink-0" /> Parents Details
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

        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Father / Guardian</label>
            <div className="grid grid-cols-1 gap-2">
              <div className="bg-white/5 py-2 px-2 rounded-2xl border border-white/5">
                <p className="text-[10px] text-gray-500 font-bold uppercase">Name</p>
                <p className="text-xs font-bold text-white">{fatherName || "Not Provided"}</p>
              </div>
              <div className="bg-white/5 py-2 px-2 rounded-2xl border border-white/5">
                <p className="text-[10px] text-gray-500 font-bold uppercase">Occupation</p>
                <p className="text-xs font-bold text-white">{fatherOccupation || "-"}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Mother</label>
            <div className="bg-white/5 py-2 px-2 rounded-2xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase">Name</p>
              <p className="text-xs font-bold text-white">{motherName || "Not Provided"}</p>
            </div>
          </div>
        </div>
      </div>

      {studentModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-student-sidebar-title"
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-xl">
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
                  options={[
                    { label: "Day Scholar", value: "Day Scholar" },
                    { label: "Hosteller", value: "Hosteller" },
                  ]}
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
        </div>
      ) : null}

      {parentModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-parent-sidebar-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-xl">
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
              Guardian phone updates the student contact number on record. Occupation is stored as a single field on the student profile.
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
                <label className="mb-1 block text-xs font-medium text-white/50">Occupation</label>
                <input
                  value={pOccupation}
                  onChange={(e) => setPOccupation(e.target.value)}
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
        </div>
      ) : null}
    </div>
  );
};
