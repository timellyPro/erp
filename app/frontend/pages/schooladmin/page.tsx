"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import SchoolAdminDashboard from "../../components/schooladmin/dashboard/page";
import StudentDetails from "../../components/schooladmin/StudentDetails";
import Certificates from "../../components/schooladmin/Certificates";
//import { ExamsPageInner } from "../../components/schooladmin/Exams";
import ExamsPage from "../../components/schooladmin/exams/exams";
import SchoolAdminSettingsTab from "../../components/schooladmin/Settings";
import SchoolAdminTeacherTab from "../../components/schooladmin/TeachersTab";
import SchoolAdminCircularsTab from "../../components/schooladmin/circularTab";
import AdmissionTab from "../../components/teacher/admission/Admission";
import { fetchSchoolDashboardFast } from "@/lib/loadSchoolDashboard";
import { warmSchoolFeesPage } from "@/lib/loadSchoolFeesPage";
import { warmAddUserPage } from "@/lib/fetchAddUserPage";
import { warmTeachersPage } from "@/lib/fetchTeachersPage";
import { todayYmdLocal } from "@/lib/schoolDashboardCollection";

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
    void fetchSchoolDashboardFast(todayYmdLocal(), { schoolId: sid }).catch(() => {});
    warmSchoolFeesPage(sid);
    warmAddUserPage(sid);
    warmTeachersPage(sid);
  }, [session?.user?.schoolId]);

  useEffect(() => {
    if (tab === "add-user" && session?.user?.schoolId) {
      warmAddUserPage(session.user.schoolId);
    }
    if (tab === "teachers" && session?.user?.schoolId) {
      warmTeachersPage(session.user.schoolId);
    }
  }, [tab, session?.user?.schoolId]);

  useEffect(() => {
    if (tab === "fees") {
      router.replace("/frontend/pages/schooladmin/fees");
    }
    if (tab === "analysis") {
      router.replace("/frontend/pages/schooladmin/analysis");
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
