"use client";

import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  clearSuperAdminBrowserSession,
  shouldForceSuperAdminRelogin,
} from "@/lib/superAdminBrowserSession";

/** Forces superadmin re-login when opening the app with a stale cookie (no active browser session). */
export default function SuperAdminSessionGuard() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      clearSuperAdminBrowserSession();
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || session?.user?.role !== "SUPERADMIN") return;
    if (!shouldForceSuperAdminRelogin()) return;
    void signOut({ callbackUrl: "/admin/login" });
  }, [status, session?.user?.role]);

  return null;
}
