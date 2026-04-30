"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import AppLayout from "../../AppLayout";
import { SCHOOLADMIN_MENU_ITEMS, SCHOOLADMIN_TAB_TITLES } from "../../constants/sidebar";
import RequiredRoles from "../../auth/RequiredRoles";
import SchoolAdminStudentsTab from "../../components/schooladmin/Students";
import SchoolAdminClassesTab from "../../components/schooladmin/Classes";
import SchoolTeacherLeavesTab from "../../components/schooladmin/TeacherLeaves";
import NewsFeed from "../../components/schooladmin/Newsfeed";
import WorkshopsAndEventsTab from "../../components/schooladmin/workshopsandevents";
import TeacherAuditTab from "../../components/schooladmin/TeacherAudit";
import AddUser from "../../components/schooladmin/AddUser";
import SchoolAdminFeesTab from "../../components/schooladmin/Fees";
import SchoolAdminDashboard from "../../components/schooladmin/dashboard/page";
import StudentDetails from "../../components/schooladmin/StudentDetails";
import Certificates from "../../components/schooladmin/Certificates";
//import { ExamsPageInner } from "../../components/schooladmin/Exams";
import ExamsPage from "../../components/schooladmin/exams/exams";
import SchoolAdminAnalysisTab from "../../components/schooladmin/Analysis";
import SchoolAdminSettingsTab from "../../components/schooladmin/Settings";
import SchoolAdminTeacherTab from "../../components/schooladmin/TeachersTab";
import SchoolAdminCircularsTab from "../../components/schooladmin/circularTab";
import AdmissionTab from "../../components/teacher/admission/Admission";

function SchoolAdminContent() {
  const { data: session } = useSession();
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
        
      case "analysis":
        return <SchoolAdminAnalysisTab />;
      case "fees":
        return <SchoolAdminFeesTab />;
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
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-white/70">Loading...</div>}>
      <SchoolAdminContent />
    </Suspense>
  );
}
