"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import RequiredRoles from "../../../auth/RequiredRoles";
import AppLayout from "../../../AppLayout";
import { SCHOOLADMIN_MENU_ITEMS } from "../../../constants/sidebar";
import AnalysisDashboard, { type AnalysisSection } from "../../../components/schooladmin/Analysis";

type Props = {
  section: AnalysisSection;
};

export default function SchoolAdminAnalysisShell({ section }: Props) {
  const { data: session } = useSession();
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

  return (
    <RequiredRoles allowedRoles={["SCHOOLADMIN", "SUPERADMIN"]}>
      <AppLayout
        activeTab="analysis"
        title="Analysis"
        menuItems={SCHOOLADMIN_MENU_ITEMS}
        profile={profile}
        children={<AnalysisDashboard section={section} />}
      />
    </RequiredRoles>
  );
}
