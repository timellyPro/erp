"use client";

import { Save } from "lucide-react";
import ParentSettingsView from "../settings/ParentSettingsView";
import SchoolAdminSettingsView from "../settings/SchoolAdminSettingsView";
import TeacherSettingsView from "../settings/TeacherSettingsView";
import type { CommonSettingsProps, PortalVariant } from "../settings/portalSettingsTypes";
import ParentTimellyLoader from "../parent/ParentTimellyLoader";
import PageHeader from "./PageHeader";
import TimellyLoader from "./TimellyLoader";
import { usePortalSettingsState, getSettingsSubtitle } from "./shared/portal-settings";

export default function PortalSettingsPanel({ portal }: { portal: PortalVariant }) {
  const {
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
  } = usePortalSettingsState(portal);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4">
        {portal === "parent" ? (
          <ParentTimellyLoader preset="settings" className="w-full max-w-2xl" />
        ) : (
          <TimellyLoader
            title="Loading settings"
            steps={["Profile", "Preferences", "Security"]}
          />
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
