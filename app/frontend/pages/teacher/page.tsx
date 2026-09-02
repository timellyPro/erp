"use client";

import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import AppLayout from "../../AppLayout";
import { TEACHER_MENU_ITEMS } from "../../constants/sidebar";
import RequiredRoles from "../../auth/RequiredRoles";
import RequireFeature from "../../auth/RequireFeature";
import TeacherDashboard from "../../components/teacher/dashboard/Dashboard";
import TeacherClasses from "../../components/teacher/classes/Classes";
import TeacherMarksTab from "../../components/teacher/marks/Marks";
import TeacherHomeworkTab from "../../components/teacher/homework/Homework";
import TeacherAttendanceTab from "../../components/teacher/attendance/Attendance";
import TeacherExamsTab from "../../components/teacher/exams/Exams";
import TeacherTimetableTab from "../../components/teacher/timetable/TeacherTimetable";
import TeacherWorkshopsTab from "../../components/teacher/workshops/WorkShops";
import TeacherParentChatTab from "../../components/teacher/parentchat/ParentChat";
import TeacherLeavesTab from "../../components/teacher/leave/Leave";
import TeacherProfileTab from "../../components/teacher/profile/Profile";
import TeacherSettingsTab from "../../components/teacher/settings/Settings";
import TeacherAdmissionTab from "../../components/teacher/admission/Admission";
import NewsFeed from "../../components/schooladmin/Newsfeed";
import SchoolAdminStudentsTab from "../../components/schooladmin/Students";
import StudentDetails from "../../components/schooladmin/StudentDetails";
import SchoolAdminTeacherTab from "../../components/schooladmin/TeachersTab";
import SchoolTeacherLeavesTab from "../../components/schooladmin/TeacherLeaves";
import TeacherAuditTab from "../../components/schooladmin/TeacherAudit";
import Certificates from "../../components/schooladmin/Certificates";
import SchoolAdminFeesTab from "../../components/schooladmin/Fees";
import TimellyLoader from "../../components/common/TimellyLoader";
import { warmTeacherFastTabs, warmTeacherTab } from "@/lib/loadTeacherFastTabs";

const TEACHER_TAB_TITLES = {
  dashboard: "Dashboard",
  admission: "Admission",
  attendance: "Attendance",
  timetable: "Timetable",
  marks: "Marks",
  classes: "Classes",
  homework: "Homework",
  leaves: "Leave Request",
  circulars: "Circulars",
  newsfeed: "Newsfeed",
  chat: "Parent Chat",
  exams: "Exams",
  workshops: "Workshops",
  profile: "Profile",
  settings: "Settings",
  students: "Students",
  "student-details": "Student Details",
  teachers: "Teachers",
  "teacher-leaves": "Teacher Leaves",
  "teacher-audit": "Teacher Audit",
  certificates: "Certificates",
  fees: "Fees & Payments",
};

function TeacherDashboardInner() {
  const { data: session } = useSession();
  const tab = useSearchParams().get("tab") ?? "dashboard";
  const title = (TEACHER_TAB_TITLES as Record<string, string>)[tab] ?? tab.toUpperCase();
  const schoolId = session?.user?.schoolId ?? null;
  const [profile, setProfile] = useState({
    name: session?.user?.name ?? "Teacher",
    subtitle: "Teacher",
    image: (session?.user as { image?: string | null })?.image ?? null,
    email: session?.user?.email ?? undefined,
    phone: (session?.user as { mobile?: string })?.mobile ?? undefined,
    address: undefined as string | undefined,
    userId: (session?.user as { id?: string })?.id ?? undefined,
  });

  useEffect(() => {
    warmTeacherFastTabs(schoolId);
  }, [schoolId]);

  useEffect(() => {
    warmTeacherTab(tab, schoolId);
  }, [tab, schoolId]);

  const renderTabContent = () => {
    switch (tab) {
      case "dashboard":
        return <TeacherDashboard />;
      case "admission":
        return <TeacherAdmissionTab />;
      case "classes":
        return <TeacherClasses />;
      case "marks":
        return <TeacherMarksTab />;
      case "homework":
        return <TeacherHomeworkTab />;
      case "attendance":
        return <TeacherAttendanceTab />;
      case "timetable":
        return <TeacherTimetableTab />;
      case "exams":
        return <TeacherExamsTab />;
      case "workshops":
        return <TeacherWorkshopsTab />;
      case "newsfeed":
        return <NewsFeed />;
      case "chat":
        return <TeacherParentChatTab />;
      case "leaves":
        return <TeacherLeavesTab />;
      case "profile":
        return <TeacherProfileTab />;
      case "settings":
        return <TeacherSettingsTab />;
      case "students":
        return <SchoolAdminStudentsTab />;
      case "student-details":
        return <StudentDetails />;
      case "teachers":
        return <SchoolAdminTeacherTab />;
      case "teacher-leaves":
        return <SchoolTeacherLeavesTab />;
      case "teacher-audit":
        return <TeacherAuditTab />;
      case "certificates":
        return <Certificates />;
      case "fees":
        return <SchoolAdminFeesTab />;
      default:
        return <div>Unknown Tab</div>;
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/me", { credentials: "include", cache: "no-store" });
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const u = data.user;
        if (u) {
          setProfile({
            name: u.name ?? session?.user?.name ?? "Teacher",
            subtitle: "Teacher",
            image: u.photoUrl ?? session?.user?.image ?? null,
            email: u.email ?? session?.user?.email ?? undefined,
            phone: u.mobile ?? (session?.user as { mobile?: string })?.mobile ?? undefined,
            address: u.address ?? undefined,
            userId: u.id ?? (session?.user as { id?: string })?.id ?? undefined,
          });
        }
      } catch {
        // keep session-based default
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    session?.user?.name,
    session?.user?.image,
    session?.user?.email,
    (session?.user as { mobile?: string })?.mobile,
    (session?.user as { id?: string })?.id,
  ]);

  return (
    <RequiredRoles allowedRoles={["TEACHER"]}>
      <RequireFeature requiredFeature={tab}>
        <AppLayout
          activeTab={tab}
          title={title}
          menuItems={TEACHER_MENU_ITEMS}
          profile={profile}
          children={renderTabContent()}
        />
      </RequireFeature>
    </RequiredRoles>
  );
}

export default function TeacherDashboardContent() {
  return (
    <Suspense
      fallback={
        <TimellyLoader title="Loading teacher portal" steps={["Navigation", "Profile", "Workspace"]} />
      }
    >
      <TeacherDashboardInner />
    </Suspense>
  );
}
