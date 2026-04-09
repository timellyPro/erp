"use client";

import { useEffect, useState } from "react";
import SuccessPopups from "../../common/SuccessPopUps";
import { CLASS_HANDLING, DEFAULT_TEACHER_PROFILE, QUICK_STATS } from "./data";
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

type ProfileTab = "overview" | "edit";

type MeAssignedClass = {
  id: string;
  name: string;
  section: string | null;
  _count: { students: number };
};

type MeUserResponse = {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  address: string | null;
  qualification: string | null;
  experience: string | null;
  photoUrl: string | null;
  teacherId: string | null;
  subject: string | null;
  createdAt: string;
  assignedClasses: MeAssignedClass[];
};

type MeApiResponse = {
  user: MeUserResponse;
};

type EventListItem = {
  type?: string | null;
};

type EventListResponse = {
  events?: EventListItem[];
};

function formatDate(value?: string | null) {
  if (!value) return DEFAULT_TEACHER_PROFILE.joiningDate;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return DEFAULT_TEACHER_PROFILE.joiningDate;
  return date.toLocaleDateString("en-GB");
}

function mapClassName(name: string, section?: string | null) {
  if (!section) return name;
  return `${name}-${section}`;
}

export default function TeacherProfileTab() {
  const [profileData, setProfileData] = useState<TeacherProfileData>(DEFAULT_TEACHER_PROFILE);
  const [draftData, setDraftData] = useState<TeacherProfileData>(DEFAULT_TEACHER_PROFILE);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [showSuccess, setShowSuccess] = useState(false);
  const [classes, setClasses] = useState<ClassHandlingItem[]>(CLASS_HANDLING);
  const [quickStats, setQuickStats] = useState<QuickStats>(QUICK_STATS);

  const fetchWorkshopsCount = async (teacherId: string) => {
    try {
      const res = await fetch(`/api/events/list?teacherId=${encodeURIComponent(teacherId)}`);
      const data = (await res.json()) as EventListResponse;
      if (!res.ok) return QUICK_STATS.workshopsConducted;
      const events = data?.events ?? [];
      return events.filter((event) => (event.type ?? "").toLowerCase() === "workshop").length;
    } catch {
      return QUICK_STATS.workshopsConducted;
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/user/me");
        const data = (await res.json()) as MeApiResponse;
        if (!res.ok || cancelled || !data?.user) return;

        const user = data.user;
        const mappedClasses: ClassHandlingItem[] =
          (user.assignedClasses ?? []).map((item) => ({
            className: `Class ${mapClassName(item.name, item.section)}`,
            subject: user.subject ?? DEFAULT_TEACHER_PROFILE.subject,
            students: item._count?.students ?? 0,
          })) || [];
        const workshopsConducted = await fetchWorkshopsCount(user.id);

        const mappedProfile: TeacherProfileData = {
          ...DEFAULT_TEACHER_PROFILE,
          name: user.name ?? DEFAULT_TEACHER_PROFILE.name,
          email: user.email ?? DEFAULT_TEACHER_PROFILE.email,
          phone: user.mobile ?? "-",
          address: user.address ?? "-",
          qualification: user.qualification ?? "-",
          experience: user.experience ?? "-",
          avatarUrl: user.photoUrl ?? DEFAULT_TEACHER_PROFILE.avatarUrl,
          teacherId: user.teacherId ?? DEFAULT_TEACHER_PROFILE.teacherId,
          subject: user.subject ?? DEFAULT_TEACHER_PROFILE.subject,
          joiningDate: formatDate(user.createdAt),
          assignedClasses:
            mappedClasses.length > 0
              ? mappedClasses.map((c) => c.className.replace(/^Class\s/, "")).join(", ")
              : DEFAULT_TEACHER_PROFILE.assignedClasses,
        };

        setProfileData(mappedProfile);
        setDraftData(mappedProfile);

        if (mappedClasses.length > 0) {
          const totalStudents = mappedClasses.reduce((sum, c) => sum + c.students, 0);
          setClasses(mappedClasses);
          setQuickStats({
            ...QUICK_STATS,
            totalClasses: mappedClasses.length,
            totalStudents,
            workshopsConducted,
          });
        } else {
          setQuickStats((prev) => ({
            ...prev,
            workshopsConducted,
          }));
        }
      } catch {
        // Keep defaults if API fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

      const data = (await res.json()) as MeApiResponse;
      const user = data?.user;

      if (user) {
        const mappedClasses: ClassHandlingItem[] =
          (user.assignedClasses ?? []).map((item) => ({
            className: `Class ${mapClassName(item.name, item.section)}`,
            subject: user.subject ?? draftData.subject,
            students: item._count?.students ?? 0,
          })) || [];
        const workshopsConducted = await fetchWorkshopsCount(user.id);

        const mappedProfile: TeacherProfileData = {
          ...draftData,
          name: user.name ?? draftData.name,
          email: user.email ?? draftData.email,
          phone: user.mobile ?? draftData.phone,
          address: user.address ?? draftData.address,
          qualification: user.qualification ?? draftData.qualification,
          experience: user.experience ?? draftData.experience,
          avatarUrl: user.photoUrl ?? draftData.avatarUrl,
          teacherId: user.teacherId ?? draftData.teacherId,
          subject: user.subject ?? draftData.subject,
          joiningDate: formatDate(user.createdAt),
        };
        setProfileData(mappedProfile);
        setDraftData(mappedProfile);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("profile-updated", {
              detail: { userId: user.id, photoUrl: mappedProfile.avatarUrl },
            })
          );
          localStorage.setItem("timelly:profile-updated", String(Date.now()));
        }

        if (mappedClasses.length > 0) {
          const totalStudents = mappedClasses.reduce((sum, c) => sum + c.students, 0);
          setClasses(mappedClasses);
          setQuickStats({
            ...QUICK_STATS,
            totalClasses: mappedClasses.length,
            totalStudents,
            workshopsConducted,
          });
        } else {
          setQuickStats((prev) => ({
            ...prev,
            workshopsConducted,
          }));
        }
      } else {
        setProfileData(draftData);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("profile-updated", {
              detail: { photoUrl: draftData.avatarUrl },
            })
          );
          localStorage.setItem("timelly:profile-updated", String(Date.now()));
        }
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

  return (
    <div className="w-full min-h-screen text-white px-3 sm:px-6 lg:px-8 2xl:px-12 py-4 space-y-6">
      {/* <PageHeader title="Profile" subtitle={welcomeSubtitle} className="mb-6" /> */}

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
