"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import RequiredRoles from "../../../auth/RequiredRoles";
import AppLayout from "../../../AppLayout";
import { SCHOOLADMIN_MENU_ITEMS } from "../../../constants/sidebar";
import FeesTab from "../../../components/schooladmin/Fees";
import { warmSchoolFeesPage } from "@/lib/loadSchoolFeesPage";

type FeesSection =
  | "overview"
  | "offline-payment"
  | "add-extra-fees"
  | "fee-structure"
  | "extra-fees-catalog"
  | "transactions"
  | "fees-records"
  | "petty-cash"
  | "student-fee-records";

type SchoolAdminFeesShellProps = {
  section: FeesSection;
};

export default function SchoolAdminFeesShell({ section }: SchoolAdminFeesShellProps) {
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
    const sid = session?.user?.schoolId;
    if (sid) warmSchoolFeesPage(sid);
  }, [session?.user?.schoolId]);

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
        activeTab="fees"
        title="Fees"
        menuItems={SCHOOLADMIN_MENU_ITEMS}
        profile={profile}
        children={<FeesTab section={section} />}
      />
    </RequiredRoles>
  );
}
