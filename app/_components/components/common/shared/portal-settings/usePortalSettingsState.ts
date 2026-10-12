import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { uploadImage } from "../../../../utils/upload";
import { useToastContext } from "../../../../context/ToastContext";
import type {
  FormState,
  NotificationState,
  PasswordState,
  PortalVariant,
  PreferencesState,
} from "../../../settings/portalSettingsTypes";
import {
  loadSettingsUser,
  peekSettingsUser,
  setSettingsUserCache,
} from "@/lib/school/loadSchoolAdminFastTabs";
import {
  baseForm,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PREFS,
  EMPTY_PASSWORD,
  makeFormFromUser,
  savePassword,
  saveProfile,
  type UserMe,
} from "./portalSettingsHelpers";
import {
  fetchCurrentUserSettings,
  fetchParentDetailsSettings,
  saveUserProfile,
} from "@/lib/api/portalSettings";

export function usePortalSettingsState(portal: PortalVariant) {
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
    const cachedUser = portal === "parent" ? null : peekSettingsUser();
    if (cachedUser?.user) {
      const u = cachedUser.user as UserMe;
      setUserId(u.id ?? "");
      const next = makeFormFromUser(u, portal, session, {});
      setForm(next);
      setInitialForm(next);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const [userData, parentDetailsResult] = await Promise.all([
        portal === "parent"
          ? fetchCurrentUserSettings().then(({ ok, data }) => {
              if (!ok || !data?.user) throw new Error(data?.message || "Unable to load settings");
              return data;
            })
          : loadSettingsUser({ revalidate: Boolean(cachedUser) }),
        portal === "parent" ? fetchParentDetailsSettings() : null,
      ]);

      const u = userData.user as UserMe;
      setUserId(u.id ?? "");

      let parentDetails: Record<string, string | null | undefined> = {};
      if (portal === "parent" && parentDetailsResult) {
        if (parentDetailsResult.ok && parentDetailsResult.data) {
          parentDetails = parentDetailsResult.data;
        } else {
          // If parent details fetch fails, use empty values
          console.warn("Failed to load parent details");
        }
      }

      const next = makeFormFromUser(u, portal, session, parentDetails);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the individual session fields so a new session object does not refetch
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
        const { ok, data } = await saveUserProfile({
          name: form.name.trim(),
          mobile: form.mobile.trim() || null,
          address: form.address?.trim() || null,
          language: form.language,
          photoUrl: photoUrl || null,
        });
        if (!ok) {
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
        setSettingsUserCache({
          user: {
            id: userId,
            name: form.name,
            email: form.email,
            mobile: form.mobile,
            address: form.address ?? null,
            language: form.language,
            photoUrl: photoUrl ?? null,
          },
        });
      } catch (error) {
        toast.show(error instanceof Error ? error.message : "Image upload failed.", "error");
      } finally {
        setUploading(false);
      }
      if (event.target) {
        event.target.value = "";
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uploads use the form snapshot at click time; userId/address/email are read from session
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
      if (portal !== "parent") {
        setSettingsUserCache({
          user: {
            id: userId,
            name: form.name,
            email: form.email,
            mobile: form.mobile,
            address: form.address ?? null,
            language: form.language,
            photoUrl: form.photoUrl ?? null,
          },
        });
      }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- userId comes from the session and is stable for the lifetime of the page
  }, [canSave, form, passwords, passwordDirty, prefKey, prefs, toast, portal]);

  return {
    loading,
    saving,
    passwordSaving,
    uploading,
    form,
    setForm,
    passwords,
    setPasswords,
    prefs,
    setPrefs,
    toggleNotification,
    fileInputRef,
    handleUploadAvatar,
    handleCancel,
    handleSaveAll,
    canSave,
  };
}
