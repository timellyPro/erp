"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "../../AppLayout";
import { PARENT_MENU_ITEMS } from "../../constants/sidebar";
import RequiredRoles from "../../auth/RequiredRoles";
import ParentFeesTab from "./ParentFeesTab";
import ParentSubscriptionTab from "./subscription/ParentSubscriptionTab";
import type { SidebarItem } from "../../types/sidebar";
import { fetchParentSubscriptionStatus } from "@/lib/api/parentSubscription";

const PARENT_TAB_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  homework: "Homework",
  attendance: "Attendance",
  marks: "Marks",
  chat: "Chat",
  fees: "Fees",
  certificates: "Certificates",
  settings: "Settings",
  exams: "Exams",
  analytics: "Analytics",
  workshops: "Workshops",
  leave: "Leave Application",
  profile: "Profile",
  subscription: "Subscription",
};

type SubscriptionStatusResponse = {
  status: "ACTIVE" | "EXPIRED";
  isTrial: boolean;
  billingMode: string;
  amount: number;
  remainingDays: number | null;
  expiresAt: string | null;
  invoiceUrl: string | null;
};

function renderTabContent(tab: string) {
  switch (tab) {
    case "fees":
      return <ParentFeesTab />;
    case "subscription":
      return <ParentSubscriptionTab />;
    default:
      return <div className="p-6 text-white/60">Content for {tab}</div>;
  }
}

export default function ParentDashboardClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [subStatus, setSubStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  const rawTab = searchParams.get("tab") ?? "dashboard";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingSub(true);
        const { ok, data } = await fetchParentSubscriptionStatus();
        if (!cancelled && ok) {
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

  const menuItems: SidebarItem[] = useMemo(() => {
    if (!isLocked) return PARENT_MENU_ITEMS;
    // When locked: allow only Profile, Subscription, Fees, Settings, Logout
    return PARENT_MENU_ITEMS.map((item) => {
      if (!item.tab) return item;
      if (["profile", "subscription", "fees", "settings"].includes(item.tab)) {
        return { ...item, disabled: false };
      }
      return { ...item, disabled: true };
    });
  }, [isLocked]);

  const tab = useMemo(() => {
    if (!isLocked) return rawTab;
    // If locked and current tab is not allowed, redirect to subscription tab
    if (!["profile", "subscription", "fees", "settings"].includes(rawTab)) {
      // Use replace so back button does not go to locked tab again
      router.replace("/parent?tab=subscription");
      return "subscription";
    }
    return rawTab;
  }, [rawTab, isLocked, router]);

  const title = PARENT_TAB_TITLES[tab] ?? tab.toUpperCase();

  return (
    <RequiredRoles allowedRoles={["STUDENT"]}>
      <AppLayout
        title={title}
        activeTab={tab}
        menuItems={menuItems}
        profile={{ name: "Parent", subtitle: "Student Parent" }}
      >
        {renderTabContent(tab)}
        {isLocked && !loadingSub && (
          <div className="fixed bottom-4 right-4 max-w-sm rounded-2xl bg-red-500/10 border border-red-400/40 px-4 py-3 text-sm text-red-100 backdrop-blur-md shadow-lg">
            <p className="font-semibold mb-1">Subscription required</p>
            <p className="text-xs text-red-100/80">
              Your access is limited. Please subscribe from the Fees section or contact the school.
            </p>
          </div>
        )}
      </AppLayout>
    </RequiredRoles>
  );
}

