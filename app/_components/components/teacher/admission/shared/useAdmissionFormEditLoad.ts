import { useEffect } from "react";
import { normalizeResidencyType } from "./utils";
import type { FormState } from "./types";

export function useAdmissionFormEditLoad({
  view,
  editId,
  setForm,
  setMessage,
  setMessageTone,
}: {
  view: "add" | "all";
  editId: string | null;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  setMessage: (message: string | null) => void;
  setMessageTone: (tone: "success" | "error") => void;
}) {
  useEffect(() => {
    if (view !== "add" || !editId) return;
    let active = true;
    setMessage(null);
    fetch(`/api/admissions/${editId}`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.message || "Failed to load admission");
        const a = d?.application;
        if (!a || !active) return;
        setForm({
          applicationNo: a.applicationNo ?? "",
          fedenaNo: a.fedenaNo ?? "",
          penNumber: a.penNumber ?? "",
          apaarId: a.apaarId ?? "",
          admissionNo: a.admissionNo ?? "",
          classId: a.classId ?? "",
          gradeSought: a.gradeSought,
          boardingType: a.boardingType,
          residencyType: normalizeResidencyType(a.residencyType),
          applicationFee:
            a.applicationFee === null || a.applicationFee === undefined ? "" : String(a.applicationFee),
          admissionFee: a.admissionFee === null || a.admissionFee === undefined ? "" : String(a.admissionFee),
          studentName: [a.firstName, a.middleName, a.lastName].filter(Boolean).join(" "),
          gender: a.gender,
          dateOfBirth: a.dateOfBirth ? String(a.dateOfBirth).slice(0, 10) : "",
          aadharNo: a.aadharNo ?? "",
          firstLanguage: a.firstLanguage ?? "",
          nationality: a.nationality ?? "Indian",
          languagesAtHome: a.languagesAtHome ?? "",
          caste: a.caste ?? "",
          religion: a.religion ?? "",
          presentAddress: a.houseNo ?? "",
          permanentAddress: a.street ?? "",
          parentName: a.parentName ?? "",
          parentOccupation: a.parentOccupation ?? "",
          officeAddress: a.officeAddress ?? "",
          parentPhone: a.parentPhone ?? "",
          parentEmail: a.parentEmail ?? "",
          parentAadharNo: a.parentAadharNo ?? "",
          parentWhatsapp: a.parentWhatsapp ?? "",
          bankAccountNo: a.bankAccountNo ?? "",
          motherName: a.motherName ?? "",
          // Mother phone is stored on the application as `emergencyMotherNo` (same as student profile).
          motherPhone: (() => {
            const em = String((a as { emergencyMotherNo?: string | null }).emergencyMotherNo ?? "").trim();
            if (em && em !== "-") return em;
            return "";
          })(),
          motherAadharNo: a.motherAadharNo ?? "",
          motherEmail: a.motherEmail ?? "",
          panNumber: a.panNumber ?? "",
          previousSchoolName: a.previousSchoolName ?? "",
          previousSchoolAddress: a.previousSchoolAddress ?? "",
          emergencyFatherNo: a.emergencyFatherNo ?? "",
          emergencyMotherNo: a.emergencyMotherNo ?? "",
          emergencyGuardianNo: a.emergencyGuardianNo ?? "",
        });
      })
      .catch((e) => {
        if (!active) return;
        setMessageTone("error");
        setMessage(e instanceof Error ? e.message : "Failed to load admission");
      });
    return () => {
      active = false;
    };
  }, [view, editId, setForm, setMessage, setMessageTone]);
}
