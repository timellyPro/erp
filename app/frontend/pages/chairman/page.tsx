"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import AppLayout from "../../AppLayout";
import RequiredRoles from "../../auth/RequiredRoles";
import { CHAIRMAN_MENU_ITEMS } from "../../constants/sidebar";
import ChairmanDashboard, { warmChairmanDashboard } from "../../components/chairman/ChairmanDashboard";
import DiscountApprovals, { warmDiscountApprovals } from "../../components/chairman/DiscountApprovals";
import ChairmanSettings from "../../components/chairman/ChairmanSettings";
import TimellyLoader from "../../components/common/TimellyLoader";

const CHAIRMAN_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  "discount-approvals": "Discount Approvals",
  settings: "Settings",
};

function ChairmanContent() {
  const { data: session, status } = useSession();
  const tab = useSearchParams().get("tab") ?? "dashboard";
  const title = CHAIRMAN_TITLES[tab] ?? "Dashboard";
  const [profile, setProfile] = useState<{
    name: string;
    subtitle?: string;
    image?: string | null;
    email?: string;
    phone?: string;
    address?: string;
    userId?: string;
  }>({
    name: session?.user?.name ?? "Chairman",
    subtitle: "Chairman",
  });

  const fetchProfile = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/user/me", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.user) return;
      setProfile({
        name: data.user.name ?? session?.user?.name ?? "Chairman",
        subtitle: "Chairman",
        image: data.user.photoUrl ?? null,
        email: data.user.email ?? undefined,
        phone: data.user.mobile ?? undefined,
        address: data.user.address ?? undefined,
        userId: data.user.id ?? undefined,
      });
    } catch {
      // Keep session fallback.
    }
  }, [session?.user?.name, status]);

  useEffect(() => {
    if (tab === "settings") void fetchProfile();
  }, [fetchProfile, tab]);

  useEffect(() => {
    if (status === "authenticated") {
      warmDiscountApprovals("PENDING");
      warmChairmanDashboard();
    }
  }, [status]);

  if (status === "loading") {
    return (
      <TimellyLoader
        title="Opening chairman portal"
        steps={["Checking session", "Preparing access", "Loading workspace"]}
        bare
        className="min-h-screen bg-[#08080a]"
      />
    );
  }

  const renderContent = () => {
    switch (tab) {
      case "discount-approvals":
        return <DiscountApprovals />;
      case "settings":
        return <ChairmanSettings onProfileUpdated={() => void fetchProfile()} />;
      case "dashboard":
      default:
        return <ChairmanDashboard />;
    }
  };

  return (
    <RequiredRoles allowedRoles={["CHAIRMAN", "SUPERADMIN"]}>
      <AppLayout
        title={title}
        activeTab={tab}
        menuItems={CHAIRMAN_MENU_ITEMS}
        profile={profile}
        hideSearchAndNotifications
      >
        {renderContent()}
      </AppLayout>
    </RequiredRoles>
  );
}

export default function ChairmanPage() {
  return (
    <Suspense
      fallback={
        <TimellyLoader
          title="Loading chairman page"
          steps={["Dashboard", "Approvals", "Settings"]}
          bare
          className="min-h-screen bg-[#08080a]"
        />
      }
    >
      <ChairmanContent />
    </Suspense>
  );
}
