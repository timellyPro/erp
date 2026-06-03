"use client";

import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  clearSuperAdminBrowserSession,
  hasSuperAdminBrowserSession,
} from "@/lib/superAdminBrowserSession";

/** Forces superadmin re-login when the browser tab/session has no active marker. */
export default function SuperAdminSessionGuard() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      clearSuperAdminBrowserSession();
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || session?.user?.role !== "SUPERADMIN") return;
    if (hasSuperAdminBrowserSession()) return;
    void signOut({ callbackUrl: "/admin/login" });
  }, [status, session?.user?.role]);

  return null;
}
