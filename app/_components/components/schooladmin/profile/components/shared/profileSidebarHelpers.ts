import {
  canonicalizeResidencyType,
  formatResidencyTypeForDisplay,
} from "@/lib/students/residencyDisplay";

export const RESIDENCY_OPTIONS = [
  { label: "Day Scholar", value: "Day Scholar" },
  { label: "Hostel", value: "Hosteller" },
  { label: "RTE", value: "RTE" },
] as const;

export function residencySelectValue(value?: string | null): string {
  return canonicalizeResidencyType(value);
}

export const getResidencyLabel = (value?: string) => {
  const raw = (value || "").trim();
  if (!raw) return "Day Scholar";
  return formatResidencyTypeForDisplay(raw);
};

export interface StudentProfileProps {
  name: string;
  id: string;
  className: string;
  rollNo: string;
  age: string;
  dob?: string;
  email: string;
  phone: string;
  address: string;
  photoUrl?: string | null;
}

export type SidebarSavedPatch = {
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
  dob?: string;
  age?: string;
};

export type ProfileSidebarProps = {
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
  onSaved?: (patch?: SidebarSavedPatch) => void;
  onOpenFees?: () => void;
  /** Warm fee breakdown before the user opens the fees sheet. */
  onFeesHover?: () => void;
  /** When true, fees sheet and payment actions are disabled (inactive student). */
  feesRecordingDisabled?: boolean;
};
