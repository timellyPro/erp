"use client";

import { useCallback, useEffect, useState } from "react";
import { useRef } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Lock, MapPin, Phone, Save, User } from "lucide-react";
import { uploadImage } from "../../utils/upload";
import TimellyLoader from "../common/TimellyLoader";

type Profile = {
  name: string;
  email: string;
  mobile: string;
  address: string;
  language: string;
  photoUrl: string;
};

const PROFILE_SESSION_KEY = "chairman:profile:v1";
const PROFILE_SESSION_TTL_MS = 10 * 60_000;

function readCachedProfile(): Profile | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const cached = JSON.parse(sessionStorage.getItem(PROFILE_SESSION_KEY) ?? "null") as
      | { ts: number; profile: Profile }
      | null;
    if (!cached || Date.now() - cached.ts > PROFILE_SESSION_TTL_MS) return null;
    return cached.profile;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: Profile): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify({ ts: Date.now(), profile }));
  } catch {
    /* ignore quota */
  }
}

export default function ChairmanSettings({ onProfileUpdated }: { onProfileUpdated?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [profile, setProfile] = useState<Profile>(
    () => readCachedProfile() ?? { name: "", email: "", mobile: "", address: "", language: "English", photoUrl: "" }
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(() => readCachedProfile() == null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    const cached = readCachedProfile();
    if (cached) {
      setProfile(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const res = await fetch("/api/chairman/me", { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to load profile");
      const nextProfile = {
        name: data.user?.name ?? "",
        email: data.user?.email ?? "",
        mobile: data.user?.mobile ?? "",
        address: data.user?.address ?? "",
        language: data.user?.language ?? "English",
        photoUrl: data.user?.photoUrl ?? "",
      };
      setProfile(nextProfile);
      writeCachedProfile(nextProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const mobile = profile.mobile.trim();
    if (mobile && !/^\d{10}$/.test(mobile)) {
      setError("Mobile number must be 10 digits.");
      return;
    }

    setSavingProfile(true);
    try {
      const res = await fetch("/api/user/me", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name.trim(),
          mobile: mobile || null,
          address: profile.address.trim() || null,
          language: profile.language || "English",
          photoUrl: profile.photoUrl || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to update profile");
      writeCachedProfile(profile);
      setMessage("Profile updated.");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("profile-updated", {
            detail: { name: profile.name.trim(), photoUrl: profile.photoUrl || null },
          })
        );
        localStorage.setItem("timelly:profile-updated", String(Date.now()));
      }
      onProfileUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadProfilePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");
    try {
      const photoUrl = await uploadImage(file, "avatars");
      setProfile((prev) => ({ ...prev, photoUrl }));
      const res = await fetch("/api/user/me", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name.trim(),
          mobile: profile.mobile.trim() || null,
          address: profile.address.trim() || null,
          language: profile.language || "English",
          photoUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to save profile photo");
      writeCachedProfile({ ...profile, photoUrl });
      setMessage("Profile photo updated.");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("profile-updated", { detail: { photoUrl } }));
        localStorage.setItem("timelly:profile-updated", String(Date.now()));
      }
      onProfileUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile photo upload failed.");
    } finally {
      setUploading(false);
      if (event.target) event.target.value = "";
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!currentPassword || !newPassword) {
      setError("Current password and new password are required.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to change password");
      setMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <TimellyLoader
        title="Loading chairman settings"
        steps={["Profile", "Security", "Preferences"]}
        compact
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-white/4 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-lime-300/80">Chairman Settings</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Account Settings</h1>
        <p className="mt-1 text-sm text-white/60">Edit chairman profile, mobile number and password.</p>
      </div>

      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-lime-500/30 bg-lime-500/10 p-4 text-sm text-lime-200">{message}</div> : null}

      <form onSubmit={saveProfile} className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-white">Profile</h2>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            <img
              src={profile.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || "Chairman")}&size=120&background=4ade80&color=111827`}
              alt={profile.name || "Chairman"}
              className="h-full w-full object-cover"
              onError={(event) => {
                event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || "Chairman")}&size=120&background=4ade80&color=111827`;
              }}
            />
            {uploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              </div>
            ) : null}
          </div>
          <div>
            <p className="font-semibold text-white">Profile Photo</p>
            <p className="text-sm text-white/50">Upload JPG, PNG, or WebP image.</p>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={uploadProfilePhoto} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-2 rounded-xl border border-lime-400/30 bg-lime-400/10 px-4 py-2 text-sm font-semibold text-lime-200 hover:bg-lime-400/20 disabled:opacity-60"
            >
              {uploading ? "Uploading..." : "Update Photo"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-white/80">
              <User className="h-4 w-4 text-white/45" />
              Name
            </span>
            <input
              value={profile.name}
              onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-lime-400/70"
              placeholder="Chairman name"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-white/80">
              <Phone className="h-4 w-4 text-white/45" />
              Mobile
            </span>
            <input
              value={profile.mobile}
              onChange={(event) =>
                setProfile((prev) => ({ ...prev, mobile: event.target.value.replace(/\D/g, "").slice(0, 10) }))
              }
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-lime-400/70"
              placeholder="10 digit mobile number"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-medium text-white/80">Email</span>
            <input
              value={profile.email}
              disabled
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white/55 outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-white/80">
              <MapPin className="h-4 w-4 text-white/45" />
              Address
            </span>
            <input
              value={profile.address}
              onChange={(event) => setProfile((prev) => ({ ...prev, address: event.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-lime-400/70"
              placeholder="Address"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white/80">Language</span>
            <select
              value={profile.language}
              onChange={(event) => setProfile((prev) => ({ ...prev, language: event.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-lime-400/70"
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Kannada">Kannada</option>
              <option value="Tamil">Tamil</option>
              <option value="Telugu">Telugu</option>
              <option value="Malayalam">Malayalam</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={savingProfile}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-3 text-sm font-bold text-black disabled:opacity-60 sm:w-auto"
        >
          <Save className="h-4 w-4" />
          {savingProfile ? "Saving..." : "Save Profile"}
        </button>
      </form>

      <form onSubmit={savePassword} className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-white">Change Password</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-lime-400/70"
            placeholder="Current password"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-lime-400/70"
            placeholder="New password"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-lime-400/70"
            placeholder="Confirm new password"
          />
        </div>
        <button
          type="submit"
          disabled={savingPassword}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-black disabled:opacity-60 sm:w-auto"
        >
          <Lock className="h-4 w-4" />
          {savingPassword ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
