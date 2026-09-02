"use client";

import { useCallback, useEffect, useState } from "react";
import SuccessPopups from "../../common/SuccessPopUps";
import TimellyLoader from "../../common/TimellyLoader";
import { EMPTY_CLASSES, EMPTY_QUICK_STATS, EMPTY_TEACHER_PROFILE } from "./data";
import {
  ClassHandlingItem,
  QuickStats,
  TeacherProfileData,
} from "./types";
import ProfileBanner from "./sections/ProfileBanner";
import TeacherHeroCard from "./sections/TeacherHeroCard";
import ProfessionalInformationCard from "./sections/ProfessionalInformationCard";
import ClassesHandlingCard from "./sections/ClassesHandlingCard";
import ContactInformationCard from "./sections/ContactInformationCard";
import QuickStatsCard from "./sections/QuickStatsCard";
import EditProfileForm from "./sections/EditProfileForm";
import {
  loadTeacherProfile,
  peekTeacherProfile,
  setTeacherProfileCache,
  type TeacherProfilePagePayload,
} from "@/lib/loadTeacherFastTabs";

type ProfileTab = "overview" | "edit";

export default function TeacherProfileTab() {
  const initial = peekTeacherProfile();
  const [profileData, setProfileData] = useState<TeacherProfileData>(
    () => initial?.profile ?? EMPTY_TEACHER_PROFILE
  );
  const [draftData, setDraftData] = useState<TeacherProfileData>(
    () => initial?.profile ?? EMPTY_TEACHER_PROFILE
  );
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [showSuccess, setShowSuccess] = useState(false);
  const [classes, setClasses] = useState<ClassHandlingItem[]>(
    () => initial?.classes ?? EMPTY_CLASSES
  );
  const [quickStats, setQuickStats] = useState<QuickStats>(
    () => initial?.quickStats ?? EMPTY_QUICK_STATS
  );
  const [userId, setUserId] = useState(() => initial?.userId ?? "");
  const [loading, setLoading] = useState(() => !initial);

  const applyPayload = useCallback((payload: TeacherProfilePagePayload) => {
    setProfileData(payload.profile);
    setDraftData(payload.profile);
    setClasses(payload.classes);
    setQuickStats(payload.quickStats);
    setUserId(payload.userId);
  }, []);

  const load = useCallback(
    async (revalidate = false) => {
      if (!revalidate) {
        const cached = peekTeacherProfile();
        if (cached) {
          applyPayload(cached);
          setLoading(false);
          void load(true);
          return;
        }
        setLoading(true);
      }

      try {
        const payload = await loadTeacherProfile({ revalidate: true });
        applyPayload(payload);
      } catch {
        // Keep cached / empty state
      } finally {
        setLoading(false);
      }
    },
    [applyPayload]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const isEditMode = activeTab === "edit";

  const handleToggleEdit = () => {
    if (!isEditMode) {
      setDraftData(profileData);
    }
    setActiveTab((prev) => (prev === "overview" ? "edit" : "overview"));
  };

  const handleChange = (key: keyof TeacherProfileData, value: string) => {
    setDraftData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      const res = await fetch("/api/user/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: draftData.name,
          mobile: draftData.phone,
          address: draftData.address,
          qualification: draftData.qualification,
          experience: draftData.experience,
          photoUrl: draftData.avatarUrl,
          teacherId: draftData.teacherId,
          subject: draftData.subject,
        }),
      });
      if (!res.ok) return;

      const optimistic: TeacherProfilePagePayload = {
        userId,
        profile: { ...draftData, avatarUrl: draftData.avatarUrl?.trim() || null },
        classes,
        quickStats,
      };
      applyPayload(optimistic);
      setTeacherProfileCache(optimistic);
      void loadTeacherProfile({ revalidate: true })
        .then((fresh) => {
          applyPayload(fresh);
          setTeacherProfileCache(fresh);
        })
        .catch(() => {});

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("profile-updated", {
            detail: { userId, photoUrl: draftData.avatarUrl },
          })
        );
        localStorage.setItem("timelly:profile-updated", String(Date.now()));
      }

      setActiveTab("overview");
      setShowSuccess(true);
    } catch {
      // Keep edit mode open on error.
    }
  };

  const handleCancel = () => {
    setDraftData(profileData);
    setActiveTab("overview");
  };

  if (loading && !profileData.name) {
    return (
      <div className="w-full min-h-screen text-white px-3 sm:px-6 lg:px-8 2xl:px-12 py-4">
        <TimellyLoader title="Loading profile" steps={["Account", "Classes", "Stats"]} />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen text-white px-3 sm:px-6 lg:px-8 2xl:px-12 py-4 space-y-6">
      <div className="w-full space-y-5">
        <ProfileBanner isEditMode={isEditMode} onToggleEdit={handleToggleEdit} />

        {isEditMode ? (
          <EditProfileForm
            formData={draftData}
            onChange={handleChange}
            onCancel={handleCancel}
            onSave={handleSave}
          />
        ) : (
          <>
            <TeacherHeroCard profile={profileData} />

            <section className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr] xl:grid-cols-[2.1fr_1fr]">
              <div className="space-y-5">
                <ProfessionalInformationCard profile={profileData} />
                <ContactInformationCard profile={profileData} />
              </div>
              <div className="space-y-5">
                <ClassesHandlingCard classes={classes} />
                <QuickStatsCard stats={quickStats} />
              </div>
            </section>
          </>
        )}
      </div>
      <SuccessPopups
        open={showSuccess}
        title="Teacher profile updated successfully"
        onClose={() => setShowSuccess(false)}
      />
    </div>
  );
}
