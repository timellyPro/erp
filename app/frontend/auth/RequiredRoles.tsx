"use client";

import { ReactNode, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AuthLoadingFallback from "../components/common/AuthLoadingFallback";

// Allowed roles from your schema
type UserRoles = "SUPERADMIN" | "SCHOOLADMIN" | "CHAIRMAN" | "TEACHER" | "STUDENT";

interface RequireRoleProps {
  children: ReactNode;
  allowedRoles: UserRoles[];
}

export default function RequireRole({ children, allowedRoles }: RequireRoleProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return; // Wait for session

    const role = session?.user?.role as UserRoles | undefined;

    // If user is not logged in -> send to login (home shows login form)
    if (status === "unauthenticated" || !session?.user) {
      router.replace("/");
      return;
    }

    // Only redirect to unauthorized when role is set and not in allowed list
    // (avoids redirect when role is temporarily undefined during hydration)
    if (role != null && !allowedRoles.includes(role)) {
      router.replace("/unauthorized");
    }
  }, [session?.user?.role, session?.user, status, router, allowedRoles]);

  if (status === "loading") {
    return <AuthLoadingFallback />;
  }

  // Show loading while redirecting unauthenticated users
  if (status === "unauthenticated") {
    return <AuthLoadingFallback />;
  }

  return <>{children}</>;
}
