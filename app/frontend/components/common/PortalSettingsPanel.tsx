"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Save } from "lucide-react";
import { useSession } from "next-auth/react";
import { uploadImage } from "../../utils/upload";
import { useToastContext } from "../../context/ToastContext";
import ParentSettingsView from "../settings/ParentSettingsView";
import SchoolAdminSettingsView from "../settings/SchoolAdminSettingsView";
import TeacherSettingsView from "../settings/TeacherSettingsView";
import type {
  CommonSettingsProps,
  FormState,
  NotificationState,
  PasswordState,
  PortalVariant,
  PreferencesState,
} from "../settings/portalSettingsTypes";
import Spinner from "./Spinner";
import ParentTimellyLoader from "../parent/ParentTimellyLoader";
import PageHeader from "./PageHeader";

type UserMe = {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  address: string | null;
  language: string | null;
  photoUrl: string | null;
};

const DEFAULT_NOTIFICATIONS: NotificationState = {
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

const DEFAULT_PREFS: PreferencesState = {
  notifications: DEFAULT_NOTIFICATIONS,
  privacy: { profileVisibility: "everyone", contactVisibility: "everyone" },
};

const EMPTY_PASSWORD: PasswordState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export default function PortalSettingsPanel({ portal }: { portal: PortalVariant }) {
  const { data: session } = useSession();
  const toast = useToastContext();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [userId, setUserId] = useState("");
  const [form, setForm] = useState<FormState>(baseForm());
  const [passwords, setPasswords] = useState<PasswordState>(EMPTY_PASSWORD);
  const [prefs, setPrefs] = useState<PreferencesState>(DEFAULT_PREFS);
  const [initialForm, setInitialForm] = useState<FormState | null>(null);
  const [initialPrefs, setInitialPrefs] = useState<PreferencesState | null>(null);

  const prefKey = useMemo(
    () => `timelly.settings.preferences.${portal}.${userId || "unknown"}`,
    [portal, userId]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userRes, parentDetailsRes] = await Promise.all([
        fetch("/api/user/me"),
        portal === "parent" ? fetch("/api/student/parent-details") : Promise.resolve(null),
      ]);

      const userData = await userRes.json();
      if (!userRes.ok || !userData?.user) throw new Error(userData?.message || "Unable to load settings");

      const u = userData.user as UserMe;
      setUserId(u.id ?? "");

      let parentDetails: any = {};
      if (portal === "parent" && parentDetailsRes) {
        try {
          const parentData = await parentDetailsRes.json();
          if (parentDetailsRes.ok && parentData) {
            parentDetails = parentData;
          }
        } catch (e) {
          // If parent details fetch fails, use empty values
          console.warn("Failed to load parent details:", e);
          parentDetails = {};
        }
      }

      const next: FormState = {
        name: u.name ?? session?.user?.name ?? "User",
        email: u.email ?? session?.user?.email ?? "",
        mobile: u.mobile ?? "",
        language: u.language ?? "English",
        timezone: "Asia/Kolkata",
        photoUrl: u.photoUrl ?? session?.user?.image ?? "",
        location: "New Delhi, India",
        address: portal === "parent" ? (parentDetails.address ?? "") : (u.address ?? ""),
        fatherName: parentDetails.fatherName ?? "",
        fatherPhone: parentDetails.fatherPhone ?? "",
        motherName: parentDetails.motherName ?? "",
        occupation: parentDetails.occupation ?? "",
      };
      setForm(next);
      setInitialForm(next);
    } catch (error) {
      const fallback = baseForm({
        name: session?.user?.name ?? "User",
        email: session?.user?.email ?? "",
        mobile: session?.user?.mobile ?? "",
        photoUrl: session?.user?.image ?? "",
      });
      setForm(fallback);
      setInitialForm(fallback);
      toast.show(error instanceof Error ? error.message : "Unable to load settings", "error");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.email, session?.user?.image, session?.user?.mobile, session?.user?.name, toast, portal]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(prefKey);
      if (raw) {
        const parsed = JSON.parse(raw) as PreferencesState;
        const next: PreferencesState = {
          notifications: { ...DEFAULT_NOTIFICATIONS, ...(parsed.notifications || {}) },
          privacy: { ...DEFAULT_PREFS.privacy, ...(parsed.privacy || {}) },
        };
        setPrefs(next);
        setInitialPrefs(next);
        return;
      }
    } catch {
      // ignore
    }
    setPrefs(DEFAULT_PREFS);
    setInitialPrefs(DEFAULT_PREFS);
  }, [prefKey]);

  const formDirty = useMemo(
    () => (initialForm ? JSON.stringify(form) !== JSON.stringify(initialForm) : false),
    [form, initialForm]
  );
  const prefsDirty = useMemo(
    () => (initialPrefs ? JSON.stringify(prefs) !== JSON.stringify(initialPrefs) : false),
    [prefs, initialPrefs]
  );
  const passwordDirty = Boolean(
    passwords.currentPassword || passwords.newPassword || passwords.confirmPassword
  );
  const canSave = formDirty || prefsDirty || passwordDirty;

  const handleUploadAvatar = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.show("Please upload a valid image file.", "error");
        return;
      }
      setUploading(true);
      try {
        const photoUrl = await uploadImage(file, "avatars");
        // Update form state immediately
        setForm((prev) => ({ ...prev, photoUrl }));
        // Save to database immediately
        const res = await fetch("/api/user/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            mobile: form.mobile.trim() || null,
            address: form.address?.trim() || null,
            language: form.language,
            photoUrl: photoUrl || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || "Failed to save photo");
        }
        // Update initial form to reflect saved state
        setInitialForm((prev) => prev ? { ...prev, photoUrl } : null);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("profile-updated", {
              detail: { photoUrl },
            })
          );
          localStorage.setItem("timelly:profile-updated", String(Date.now()));
        }
        toast.show("Profile photo updated and saved.", "success");
      } catch (error) {
        toast.show(error instanceof Error ? error.message : "Image upload failed.", "error");
      } finally {
        setUploading(false);
      }
      if (event.target) {
        event.target.value = "";
      }
    },
    [toast, setForm, form.name, form.mobile, form.language]
  );

  const toggleNotification = useCallback((key: keyof NotificationState) => {
    setPrefs((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: !prev.notifications[key] },
    }));
  }, []);

  const handleCancel = () => {
    if (initialForm) setForm(initialForm);
    if (initialPrefs) setPrefs(initialPrefs);
    setPasswords(EMPTY_PASSWORD);
  };

  const handleSaveAll = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveProfile(form, portal);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("profile-updated", {
            detail: { photoUrl: form.photoUrl || null },
          })
        );
        localStorage.setItem("timelly:profile-updated", String(Date.now()));
      }
      await savePassword(passwords, passwordDirty, setPasswordSaving);
      localStorage.setItem(prefKey, JSON.stringify(prefs));
      setInitialForm(form);
      setInitialPrefs(prefs);
      toast.show("Settings saved successfully.", "success");
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Failed to save settings.", "error");
    } finally {
      setSaving(false);
    }
  }, [canSave, form, passwords, passwordDirty, prefKey, prefs, toast, portal]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4">
        {portal === "parent" ? (
          <ParentTimellyLoader preset="settings" className="w-full max-w-2xl" />
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  const viewProps: CommonSettingsProps = {
    form,
    setForm,
    passwords,
    setPasswords,
    prefs,
    setPrefs,
    toggleNotification,
    fileInputRef,
    handleUploadAvatar,
    uploading,
  };

  return (
    <div className="pb-8">
      <PageHeader
        title="Settings"
        subtitle={getSettingsSubtitle(portal)}
      />
      {portal === "teacher" && <TeacherSettingsView {...viewProps} />}
      {portal === "schooladmin" && <SchoolAdminSettingsView {...viewProps} />}
      {portal === "parent" && <ParentSettingsView {...viewProps} />}

      <div className="mt-8 flex justify-end gap-3">
        {portal === "parent" && (
          <button
            type="button"
            onClick={handleCancel}
            className="px-6 py-3 rounded-2xl border border-white/20 bg-white/10 text-white/90 hover:bg-white/15 transition"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={!canSave || saving || passwordSaving}
          className="px-7 py-3 rounded-2xl bg-lime-400 text-slate-950 font-semibold hover:bg-lime-300 disabled:opacity-55 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_12px_35px_rgba(163,230,53,0.35)]"
        >
          <Save size={18} />
          {saving || passwordSaving ? "Saving..." : portal === "teacher" ? "Save All Settings" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function getSettingsSubtitle(portal: PortalVariant) {
  if (portal === "parent") return "Manage your account preferences";
  if (portal === "schooladmin") return "Manage your account preferences";
  return "Manage your account preferences and settings";
}

function baseForm(overrides?: Partial<FormState>): FormState {
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

async function saveProfile(form: FormState, portal: PortalVariant) {
  const mobile = form.mobile?.trim() || "";
  // Only validate if mobile is provided
  if (mobile && mobile.replace(/\D/g, "").length < 10) {
    throw new Error("Phone number should contain at least 10 digits.");
  }
  
  const [userRes, parentDetailsRes] = await Promise.all([
    fetch("/api/user/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name?.trim() || "",
        mobile: mobile || null,
        address: form.address?.trim() || null,
        language: form.language || "English",
        photoUrl: form.photoUrl || null,
      }),
    }),
    portal === "parent" ? fetch("/api/student/parent-details", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: form.address || null,
        fatherName: form.fatherName || null,
        fatherPhone: form.fatherPhone || null,
        motherName: form.motherName || null,
        occupation: form.occupation || null,
      }),
    }) : Promise.resolve(null),
  ]);

  const userData = await userRes.json();
  if (!userRes.ok) throw new Error(userData?.message || "Failed to save account settings.");

  if (portal === "parent" && parentDetailsRes) {
    const parentData = await parentDetailsRes.json();
    if (!parentDetailsRes.ok) {
      throw new Error(parentData?.message || "Failed to save parent details.");
    }
  }
}

async function savePassword(
  passwords: PasswordState,
  enabled: boolean,
  setPasswordSaving: (value: boolean) => void
) {
  if (!enabled) return;
  validatePasswordInput(passwords);
  setPasswordSaving(true);
  try {
    const res = await fetch("/api/user/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Failed to update password.");
  } finally {
    setPasswordSaving(false);
  }
}

function validatePasswordInput(passwords: PasswordState) {
  if (!passwords.currentPassword) throw new Error("Current password is required.");
  if (!passwords.newPassword) throw new Error("Please enter a new password.");
  if (passwords.newPassword !== passwords.confirmPassword) throw new Error("Passwords do not match.");
}
