"use client";

import { ReactNode, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type UserRole = "SUPERADMIN" | "SCHOOLADMIN" | "CHAIRMAN" | "TEACHER" | "STUDENT";

type Props = {
  children: ReactNode;
  allowedRoles: UserRole[];
};

export default function RequireRole({ children, allowedRoles }: Props) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;
    const role = session?.user?.role as UserRole | undefined;
    if (!role || !allowedRoles.includes(role)) {
      router.replace("/unauthorized");
    }
  }, [status, session?.user?.role, router, allowedRoles]);

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  if (status !== "authenticated") {
    return null;
  }

  const role = session?.user?.role as UserRole | undefined;
  if (!role || !allowedRoles.includes(role)) {
    return null;
  }

  return <>{children}</>;
}
