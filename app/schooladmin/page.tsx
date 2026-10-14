"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import AppLayout from "@/app/_components/AppLayout";
import { SCHOOLADMIN_MENU_ITEMS, SCHOOLADMIN_TAB_TITLES } from "@/app/_components/constants/sidebar";
import RequiredRoles from "@/app/_components/auth/RequiredRoles";
import SchoolAdminStudentsTab from "@/app/_components/components/schooladmin/Students";
import SchoolAdminClassesTab from "@/app/_components/components/schooladmin/Classes";
import SchoolTeacherLeavesTab from "@/app/_components/components/schooladmin/TeacherLeaves";
import NewsFeed from "@/app/_components/components/schooladmin/Newsfeed";
import WorkshopsAndEventsTab from "@/app/_components/components/schooladmin/workshopsandevents";
import TeacherAuditTab from "@/app/_components/components/schooladmin/TeacherAudit";
import AddUser from "@/app/_components/components/schooladmin/AddUser";
import SchoolAdminDashboard from "@/app/_components/components/schooladmin/dashboard/DashboardContent";
import StudentDetails from "@/app/_components/components/schooladmin/StudentDetails";
import Certificates from "@/app/_components/components/schooladmin/Certificates";
//import { ExamsPageInner } from "@/app/_components/components/schooladmin/Exams";
import ExamsPage from "@/app/_components/components/schooladmin/exams/exams";
import SchoolAdminMarksTab from "@/app/_components/components/schooladmin/marks/Marks";
import SchoolAdminSettingsTab from "@/app/_components/components/schooladmin/Settings";
import SchoolAdminTeacherTab from "@/app/_components/components/schooladmin/TeachersTab";
import SchoolAdminCircularsTab from "@/app/_components/components/schooladmin/circularTab";
import SchoolAdminTimetableTab from "@/app/_components/components/schooladmin/Timetable";
import AdmissionTab from "@/app/_components/components/teacher/admission/Admission";
import { fetchSchoolDashboardFast } from "@/lib/school/loadSchoolDashboard";
import { warmSchoolDashboardCollectionHeads } from "@/lib/school/loadSchoolDashboardCollection";
import { warmSchoolAnalysisPage } from "@/lib/school/loadSchoolAnalysis";
import { warmSchoolFeesPage } from "@/lib/fees/loadSchoolFeesPage";
import { warmAddUserPage } from "@/lib/school/fetchAddUserPage";
import { warmTeachersPage } from "@/lib/teacher/fetchTeachersPage";
import { warmSchoolAdminFastTabs, warmSchoolAdminTab } from "@/lib/school/loadSchoolAdminFastTabs";
import { todayYmdLocal } from "@/lib/school/schoolDashboardCollection";
import TimellyLoader from "@/app/_components/components/common/TimellyLoader";

function SchoolAdminContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const tab = useSearchParams().get("tab") ?? "dashboard";
  const title = SCHOOLADMIN_TAB_TITLES[tab] ?? tab.toUpperCase();
  const [profile, setProfile] = useState<{
    name: string;
    subtitle?: string;
    image?: string | null;
    email?: string;
    phone?: string;
    address?: string;
    userId?: string;
  }>({
    name: session?.user?.name ?? "School Admin",
    subtitle: "School Admin",
  });

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
            name: u.name ?? session?.user?.name ?? "School Admin",
            subtitle: "School Admin",
            image: u.photoUrl ?? null,
            email: u.email ?? undefined,
            phone: u.mobile ?? undefined,
            address: u.address ?? undefined,
            userId: u.id ?? undefined,
          });
        }
      } catch {
        // keep default profile
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.name]);

  useEffect(() => {
    const sid = session?.user?.schoolId;
    if (!sid) return;
    const today = todayYmdLocal();
    void fetchSchoolDashboardFast(today, { schoolId: sid }).catch(() => {});
    warmSchoolDashboardCollectionHeads(today);
    warmSchoolAnalysisPage(sid);
    warmSchoolFeesPage(sid);
    warmAddUserPage(sid);
    warmTeachersPage(sid);
    warmSchoolAdminFastTabs();
  }, [session?.user?.schoolId]);

  useEffect(() => {
    if (tab === "add-user" && session?.user?.schoolId) {
      warmAddUserPage(session.user.schoolId);
    }
    if (tab === "teachers" && session?.user?.schoolId) {
      warmTeachersPage(session.user.schoolId);
    }
    warmSchoolAdminTab(tab);
  }, [tab, session?.user?.schoolId]);

  useEffect(() => {
    if (tab === "fees") {
      router.replace("/schooladmin/fees");
    }
    if (tab === "analysis") {
      router.replace("/schooladmin/analysis");
    }
  }, [router, tab]);

  if (tab === "fees") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-white/70">
        Redirecting to Fees...
      </div>
    );
  }

  if (tab === "analysis") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-white/70">
        Redirecting to Analysis...
      </div>
    );
  }

  const renderComponent = () => {
    switch (tab) {
      case "dashboard":
        return <SchoolAdminDashboard />;
      case "students":
        return <SchoolAdminStudentsTab />;
      case "admission":
        return <AdmissionTab />;
      case "add-user":
        return <AddUser />
      case "classes":
        return <SchoolAdminClassesTab />;
      case "student-details":
        return <StudentDetails />;
      case "teachers":
        return <SchoolAdminTeacherTab />
      case "timetable":
        return <SchoolAdminTimetableTab />;
      case "teacher-leaves":
        return <SchoolTeacherLeavesTab />;
      case "teacher-audit":
        return <TeacherAuditTab />;
      case "workshops":
        return <WorkshopsAndEventsTab />;
      case "newsfeed":
        return <NewsFeed />;
      case "circulars":
        return <SchoolAdminCircularsTab />;
      case "certificates":
        return <Certificates />;
      case "exams":
        return <ExamsPage />;
      case "marks":
        return <SchoolAdminMarksTab />;
      case "settings":
        return <SchoolAdminSettingsTab />;
      default:
        return <div>Not found</div>;
    }
  }

  return (
    <RequiredRoles allowedRoles={["SCHOOLADMIN", "SUPERADMIN"]}>
      <AppLayout
        activeTab={tab}
        title={title}
        menuItems={SCHOOLADMIN_MENU_ITEMS}
        profile={profile}
        children={renderComponent()}
      />
    </RequiredRoles>
  );
}

export default function SchoolAdmin() {
  return (
    <Suspense fallback={<TimellyLoader title="Loading school admin" steps={["Navigation", "Profile", "Workspace"]} />}>
      <SchoolAdminContent />
    </Suspense>
  );
}
