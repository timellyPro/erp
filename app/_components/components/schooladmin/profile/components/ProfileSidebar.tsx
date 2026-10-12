"use client";

import { Users, Mail, Phone, MapPin, Pencil, CircleDollarSign } from "lucide-react";
import { formatStoredAddressForDisplay } from "@/lib/students/studentAddressFormat";
import { formatDobDisplay } from "@/lib/dobCalendar";
import { getResidencyLabel, type ProfileSidebarProps } from "./shared";
import { useProfileSidebarState } from "./shared";
import { EditStudentModal } from "./shared";
import { EditParentModal } from "./shared";
import ResidencyConversionModal from "./ResidencyConversionModal";

export type { SidebarSavedPatch } from "./shared";

export const ProfileSidebar = (props: ProfileSidebarProps) => {
  const {
    student,
    fatherName = "",
    fatherPhone = "",
    motherName = "",
    motherPhone = "",
    residencyType = "Day Scholar",
    onOpenFees,
    onFeesHover,
    feesRecordingDisabled = false,
  } = props;
  const normalizedAddress = formatStoredAddressForDisplay(student.address || "");

  const {
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
  } = useProfileSidebarState(props);

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

        <div className="mb-2.5 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 min-w-0">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Type</p>
            <p className="text-xs font-semibold text-white truncate">{getResidencyLabel(residencyType)}</p>
            {residencyPeriods.length > 0 ? (
              <p className="mt-1 text-[10px] leading-snug text-lime-200/80">
                {residencyYearLabel ? `${residencyYearLabel}: ` : ""}
                {residencyPeriods
                  .map(
                    (period) =>
                      `${period.months} mo ${period.title}${period.transportLabel ? ` (${period.transportLabel})` : ""}`
                  )
                  .join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 min-w-0">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">DOB</p>
            <p className="text-xs font-semibold text-white truncate">{formatDobDisplay(student.dob)}</p>
          </div>
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

      {studentModalOpen ? (
        <EditStudentModal
          sName={sName}
          onSNameChange={setSName}
          sEmail={sEmail}
          onSEmailChange={setSEmail}
          sPhone={sPhone}
          onSPhoneChange={setSPhone}
          sAddress={sAddress}
          onSAddressChange={setSAddress}
          sRoll={sRoll}
          onSRollChange={setSRoll}
          sClassId={sClassId}
          onSClassIdChange={setSClassId}
          classOptions={classOptions}
          sDob={sDob}
          onSDobChange={setSDob}
          sGender={sGender}
          onSGenderChange={setSGender}
          sResidency={sResidency}
          onSResidencyChange={setSResidency}
          saving={saving}
          onClose={() => setStudentModalOpen(false)}
          onSave={() => void saveStudent()}
        />
      ) : null}

      {parentModalOpen ? (
        <EditParentModal
          pFatherName={pFatherName}
          onPFatherNameChange={setPFatherName}
          pFatherPhone={pFatherPhone}
          onPFatherPhoneChange={setPFatherPhone}
          pMotherName={pMotherName}
          onPMotherNameChange={setPMotherName}
          pMotherPhone={pMotherPhone}
          onPMotherPhoneChange={setPMotherPhone}
          saving={saving}
          onClose={() => setParentModalOpen(false)}
          onSave={() => void saveParent()}
        />
      ) : null}
      {conversionOpen && conversionPreview ? (
        <ResidencyConversionModal
          preview={conversionPreview}
          transportKey={conversionTransportKey}
          saving={conversionSaving}
          onTransportKey={(key) => void chooseConversionTransport(key)}
          onClose={() => {
            if (conversionSaving) return;
            setConversionOpen(false);
            setConversionPreview(null);
          }}
          onConfirm={() => void confirmConversion()}
        />
      ) : null}
    </div>
  );
};
