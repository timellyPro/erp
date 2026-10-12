import type {
  FormState,
  NotificationState,
  PasswordState,
  PortalVariant,
  PreferencesState,
} from "../../../settings/portalSettingsTypes";
import {
  changePassword,
  saveParentDetails,
  saveUserProfile,
} from "@/lib/api/portalSettings";

export type UserMe = {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  address: string | null;
  language: string | null;
  photoUrl: string | null;
};

export const DEFAULT_NOTIFICATIONS: NotificationState = {
  emailNotifications: true,
  pushNotifications: true,
  parentMessages: true,
  workshopReminders: true,
  leaveStatusUpdates: true,
  homeworkReminders: true,
  attendanceAlerts: true,
  marksResults: true,
  feeReminders: false,
  schoolEvents: true,
};

export const DEFAULT_PREFS: PreferencesState = {
  notifications: DEFAULT_NOTIFICATIONS,
  privacy: { profileVisibility: "everyone", contactVisibility: "everyone" },
};

export const EMPTY_PASSWORD: PasswordState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function getSettingsSubtitle(portal: PortalVariant) {
  if (portal === "parent") return "Manage your account preferences";
  if (portal === "schooladmin") return "Manage your account preferences";
  return "Manage your account preferences and settings";
}

export function baseForm(overrides?: Partial<FormState>): FormState {
  return {
    name: "",
    email: "",
    mobile: "",
    language: "English",
    timezone: "Asia/Kolkata",
    photoUrl: "",
    location: "New Delhi, India",
    address: "",
    fatherName: "",
    fatherPhone: "",
    motherName: "",
    occupation: "",
    ...overrides,
  };
}

export function makeFormFromUser(
  user: UserMe,
  portal: PortalVariant,
  session: { user?: { name?: string | null; email?: string | null; image?: string | null } } | null,
  parentDetails: Record<string, string | null | undefined>
): FormState {
  return {
    name: user.name ?? session?.user?.name ?? "User",
    email: user.email ?? session?.user?.email ?? "",
    mobile: user.mobile ?? "",
    language: user.language ?? "English",
    timezone: "Asia/Kolkata",
    photoUrl: user.photoUrl ?? session?.user?.image ?? "",
    location: "New Delhi, India",
    address: portal === "parent" ? (parentDetails.address ?? "") : (user.address ?? ""),
    fatherName: parentDetails.fatherName ?? "",
    fatherPhone: parentDetails.fatherPhone ?? "",
    motherName: parentDetails.motherName ?? "",
    occupation: parentDetails.occupation ?? "",
  };
}

export async function saveProfile(form: FormState, portal: PortalVariant) {
  const mobile = form.mobile?.trim() || "";
  // Only validate if mobile is provided
  if (mobile && mobile.replace(/\D/g, "").length < 10) {
    throw new Error("Phone number should contain at least 10 digits.");
  }

  const [userResult, parentResult] = await Promise.all([
    saveUserProfile({
      name: form.name?.trim() || "",
      mobile: mobile || null,
      address: form.address?.trim() || null,
      language: form.language || "English",
      photoUrl: form.photoUrl || null,
    }),
    portal === "parent"
      ? saveParentDetails({
          address: form.address || null,
          fatherName: form.fatherName || null,
          fatherPhone: form.fatherPhone || null,
          motherName: form.motherName || null,
          occupation: form.occupation || null,
        })
      : null,
  ]);

  if (!userResult.ok) throw new Error(userResult.data?.message || "Failed to save account settings.");

  if (portal === "parent" && parentResult && !parentResult.ok) {
    throw new Error(parentResult.data?.message || "Failed to save parent details.");
  }
}

export function validatePasswordInput(passwords: PasswordState) {
  if (!passwords.currentPassword) throw new Error("Current password is required.");
  if (!passwords.newPassword) throw new Error("Please enter a new password.");
  if (passwords.newPassword !== passwords.confirmPassword) throw new Error("Passwords do not match.");
}

export async function savePassword(
  passwords: PasswordState,
  enabled: boolean,
  setPasswordSaving: (value: boolean) => void
) {
  if (!enabled) return;
  validatePasswordInput(passwords);
  setPasswordSaving(true);
  try {
    const { ok, data } = await changePassword({
      currentPassword: passwords.currentPassword,
      newPassword: passwords.newPassword,
    });
    if (!ok) throw new Error(data?.message || "Failed to update password.");
  } finally {
    setPasswordSaving(false);
  }
}
