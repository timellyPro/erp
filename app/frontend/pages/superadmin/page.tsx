"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import AppLayout from "../../AppLayout";
import { SUPERADMIN_SIDEBAR_ITEMS } from "../../constants/sidebar";
import Dashboard from "../../components/superadmin/Dashboard";
import AddSchool from "../../components/superadmin/AddSchool";
import Schools from "../../components/superadmin/Schools";
import Transactions from "../../components/superadmin/Transactions";
import Subscriptions from "../../components/superadmin/Subscriptions";
import RequiredRoles from "../../auth/RequiredRoles";

const SUPERADMIN_TAB_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  addschool: "Add School",
  schools: "Schools",
  removeschools: "Remove schools",
  subscriptions: "Subscriptions",
  transactions: "Transactions",
};

function SuperAdminContent() {
  const tab = useSearchParams().get("tab") ?? "dashboard";
  const title = SUPERADMIN_TAB_TITLES[tab] ?? tab.toUpperCase();
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<{
    name: string;
    subtitle?: string;
    image?: string | null;
    email?: string;
    phone?: string;
    address?: string;
    userId?: string;
  }>({
    name: "Super Admin",
    subtitle: "Super Admin",
    image: null,
  });

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/user/me");
      const data = await res.json();
      if (!res.ok) return;
      const u = data.user;
      if (u) {
        setProfile({
          name: u.name ?? "Super Admin",
          subtitle: "Super Admin",
          image: u.photoUrl ?? null,
          email: u.email ?? undefined,
          phone: u.mobile ?? undefined,
          address: u.address ?? undefined,
          userId: u.id ?? undefined,
        });
      }
    } catch {
      // keep session fallback
    }
  }, []);

  // 1) When authenticated: show session first (so sidebar/header render), then fetch API for DB name/photo
  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    setProfile((prev) => ({
      name: session.user?.name ?? prev.name,
      subtitle: "Super Admin",
      image: session.user?.image ?? prev.image ?? null,
      email: session.user?.email ?? prev.email ?? undefined,
    }));
    let cancelled = false;
    fetchProfile().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [status, session?.user?.name, session?.user?.image, fetchProfile]);

  // 2) Refetch when user returns from settings (window focus) so profile updates after save
  useEffect(() => {
    const onFocus = () => {
      if (status === "authenticated") fetchProfile();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [status, fetchProfile]);

  const renderComponent = () => {
    switch (tab) {
      case "dashboard":
        return <Dashboard />;
      case "addschool":
        return <AddSchool />;
      case "schools":
        return <Schools />;
      case "removeschools":
        return <Schools variant="remove" />;
      case "subscriptions":
        return <Subscriptions />;
      case "transactions":
        return <Transactions />;
      default:
        return <div>Not found</div>;
    }
  };

  return (
    <RequiredRoles allowedRoles={["SUPERADMIN"]}>
      <AppLayout
        title={title}
        activeTab={tab}
        menuItems={SUPERADMIN_SIDEBAR_ITEMS}
        profile={profile}
        hideSearchAndNotifications
        children={renderComponent()}
      />
    </RequiredRoles>
  );
}

export default function SuperAdminDashboard() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-white/70">Loading...</div>}>
      <SuperAdminContent />
    </Suspense>
  );
}

