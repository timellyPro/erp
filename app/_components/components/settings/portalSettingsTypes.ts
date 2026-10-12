import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";

export type PortalVariant = "teacher" | "schooladmin" | "parent";

export type FormState = {
  name: string;
  email: string;
  mobile: string;
  language: string;
  timezone: string;
  photoUrl: string;
  location: string;
  address?: string;
  fatherName?: string;
  fatherPhone?: string;
  motherName?: string;
  occupation?: string;
};

export type PasswordState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type NotificationState = {
  emailNotifications: boolean;
  pushNotifications: boolean;
  parentMessages: boolean;
  workshopReminders: boolean;
  leaveStatusUpdates: boolean;
  homeworkReminders: boolean;
  attendanceAlerts: boolean;
  marksResults: boolean;
  feeReminders: boolean;
  schoolEvents: boolean;
};

export type PrivacyState = {
  profileVisibility: string;
  contactVisibility: string;
};

export type PreferencesState = {
  notifications: NotificationState;
  privacy: PrivacyState;
};

export type CommonSettingsProps = {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  passwords: PasswordState;
  setPasswords: Dispatch<SetStateAction<PasswordState>>;
  prefs: PreferencesState;
  setPrefs: Dispatch<SetStateAction<PreferencesState>>;
  toggleNotification: (key: keyof NotificationState) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleUploadAvatar: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  uploading: boolean;
};

export const CARD_CLASS =
  "rounded-3xl border border-white/15 bg-white/[0.06] backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.25)]";
export const CARD_HEADER_CLASS = "px-5 py-5 sm:px-8 sm:py-7 border-b border-white/10";
export const CARD_BODY_CLASS = "p-4 md:p-5 space-y-4";
export const LABEL_CLASS = "block text-xs md:text-sm font-medium text-gray-400 mb-2";

export const LANGUAGE_OPTIONS = [
  { label: "English", value: "English" },
  { label: "Hindi", value: "Hindi" },
];

export const TIMEZONE_OPTIONS = [
  { label: "IST (UTC+5:30)", value: "Asia/Kolkata" },
  { label: "UTC (UTC+0)", value: "UTC" },
  { label: "EST (UTC-5)", value: "America/New_York" },
  { label: "PST (UTC-8)", value: "America/Los_Angeles" },
];

export const VISIBILITY_OPTIONS = [
  { label: "Everyone", value: "everyone" },
  { label: "School Only", value: "school_only" },
  { label: "Teachers Only", value: "teachers_only" },
  { label: "Only Me", value: "only_me" },
];

export function humanizeVisibility(value: string): string {
  if (value === "school_only") return "School Only";
  if (value === "teachers_only") return "Teachers Only";
  if (value === "only_me") return "Only Me";
  return "Everyone";
}
