"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import RequiredRoles from "../../auth/RequiredRoles";
import AppLayout from "../../AppLayout";
import { PARENT_MENU_ITEMS } from "../../constants/sidebar";
import ParentHomeTab from "../../components/parent/home/ParentHome";
import ParentProfileTab from "../../components/parent/profile/ParentProfile";
import ParentAttendanceTab from "../../components/parent/attendance/ParentAttendance";
import ParentHomeworkTab from "../../components/parent/homework/ParentHomework";
import ParentMarksTab from "../../components/parent/marks/ParentMarksTab";
import ParentExamsTab from "../../components/parent/examsSyllabus/ParentExamsTab";
import ParentFeesTab from "../../components/parent/fees/ParentFeesTab";
import ParentChatsTab from "../../components/parent/chat/ParentChat";
import ParentWorkshopsTab from "../../components/parent/workshops/ParentWorkshopsTab";
import ParentCertificatesTab from "../../components/parent/certificates/ParentCerticates";
import ParentLeavesTab from "../../components/parent/leaves/LeaveApplications";
import ParentSettingsTab from "../../components/parent/settings/ParentSettings";
import ParentAnalyticsTab from "../../components/parent/analytics/ParentAnalyticsTab";
import Spinner from "../../components/common/Spinner";
import ParentSubscriptionTab from "../../components/parent/subscription/ParentSubscriptionTab";
import { Lock } from "lucide-react";

const PARENT_TAB_TITLES: Record<string, string> = {
  dashboard: "Home",
  profile: "Profile",
  homework: "Homework",
  attendance: "Attendance",
  marks: "Marks",
  exams: "Exams & Syllabus",
  fees: "Fees",
  chat: "Chat",
  workshops: "Workshops",
  certificates: "Certificates",
  leave: "Leave Application",
  settings: "Settings",
  analytics: "Analytics",
  subscription: "Subscription",
};

type SubscriptionStatusResponse = {
  status: "ACTIVE" | "EXPIRED";
  isTrial: boolean;
  billingMode: string;
  amount: number;
  remainingDays: number | null;
  expiresAt: string | null;
  trialDays?: number;
  deactivated?: boolean;
  message?: string;
};

function ParentDashboardInner() {
  const { data: session } = useSession();
  const tab = useSearchParams().get("tab") ?? "dashboard";
  const title = PARENT_TAB_TITLES[tab] ?? tab.toUpperCase();
  const [profile, setProfile] = useState({
    name: session?.user?.name ?? "Parent",
    subtitle: "Parent",
    image: (session?.user as any)?.image ?? null,
    email: session?.user?.email ?? undefined,
    phone: (session?.user as any)?.mobile ?? undefined,
    address: undefined as string | undefined,
    userId: (session?.user as any)?.id ?? undefined,
  });

  const [subStatus, setSubStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  const renderTabContent = () => {
    switch (tab) {
      case "analytics":
        return <ParentAnalyticsTab />;
      case "dashboard":
        return <ParentHomeTab />;
      case "profile":
        return <ParentProfileTab />;
      case "homework":
        return <ParentHomeworkTab />;
      case "attendance":
        return <ParentAttendanceTab />;
      case "marks":
        return <ParentMarksTab />;
      case "exams":
        return <ParentExamsTab />;
      case "fees":
        return <ParentFeesTab />;
      case "subscription":
        return <ParentSubscriptionTab />;
      case "chat":
        return <ParentChatsTab />;
      case "workshops":
        return <ParentWorkshopsTab />;
      case "certificates":
        return <ParentCertificatesTab />;
      case "leave":
        return <ParentLeavesTab />;
      case "settings":
        return <ParentSettingsTab />;
      default:
        return <div>Unknown Tab</div>;
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [userRes, parentDetailsRes] = await Promise.all([
          fetch("/api/user/me"),
          fetch("/api/student/parent-details"),
        ]);
        const userData = await userRes.json();
        const parentData = await parentDetailsRes.json().catch(() => ({}));
        if (cancelled || !userRes.ok) return;

        const u = userData.user;
        if (u) {
          setProfile({
            name: u.name ?? session?.user?.name ?? "Parent",
            subtitle: "Parent",
            image: u.photoUrl ?? session?.user?.image ?? null,
            email: u.email ?? session?.user?.email ?? undefined,
            phone: u.mobile ?? (session?.user as any)?.mobile ?? undefined,
            address: parentDetailsRes.ok ? parentData?.address ?? undefined : undefined,
            userId: u.id ?? (session?.user as any)?.id ?? undefined,
          });
        }
      } catch {
        // fallback default
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.name, session?.user?.image, session?.user?.email, (session?.user as any)?.mobile, (session?.user as any)?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingSub(true);
        const res = await fetch("/api/parent/subscription/status", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && res.ok) {
          setSubStatus(data as SubscriptionStatusResponse);
        }
      } catch {
        if (!cancelled) setSubStatus(null);
      } finally {
        if (!cancelled) setLoadingSub(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isLocked =
    subStatus &&
    subStatus.billingMode === "PARENT_SUBSCRIPTION" &&
    subStatus.status !== "ACTIVE" &&
    !subStatus.isTrial;

  const shouldLockThisTab =
    isLocked && !["fees", "subscription"].includes(tab);

  // User request: when subscription is required, show the popup card,
  // but do NOT show it on the fees page.
  const showSubscriptionModal = isLocked && !loadingSub && tab !== "fees";
  const blurBackground = showSubscriptionModal ? "blur-sm" : "";

  return (
    <RequiredRoles allowedRoles={["STUDENT"]}>
      <AppLayout
        activeTab={tab}
        title={title}
        menuItems={PARENT_MENU_ITEMS}
        profile={profile}
        enableSwitchAccounts
      >
        <div className="relative min-h-[70vh]">
          <div className={blurBackground}>{renderTabContent()}</div>

          {showSubscriptionModal && (
            <>
              <div className="fixed inset-0 z-30 bg-black/20 pointer-events-none" />
              <div className="fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 px-4 w-full max-w-sm">
                <div className="max-w-sm w-full rounded-2xl bg-black/80 border border-white/15 p-6 text-center text-white shadow-xl">
                  <div className="flex justify-center mb-3">
                    <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-lime-300" />
                    </div>
                  </div>
                  <h3 className="text-base font-semibold mb-1">Subscription required</h3>
                  <p className="text-xs text-white/70 mb-3">
                    To enjoy all Timelly features for your child, please activate your parent subscription.
                  </p>
                  <p className="text-[11px] text-white/60 mb-4">
                    Once subscribed, attendance, homework, analytics and more will be fully unlocked for you.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      (window.location.href = "/frontend/pages/parent?tab=subscription")
                    }
                    className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-lime-400 text-black hover:bg-lime-300"
                  >
                    Go to Subscription
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </AppLayout>
    </RequiredRoles>
  );
}

export default function ParentDashboardContent() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-white/70">
          <Spinner />
        </div>
      }
    >
      <ParentDashboardInner />
    </Suspense>
  );
}
