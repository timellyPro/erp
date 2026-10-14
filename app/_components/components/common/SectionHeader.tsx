"use client";

import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ROUTES } from "../../constants/routes";

export default function SectionHeader({ title }: { title: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  const handleClick = () => {
    if (!session?.user?.role) return;
    
    const role = session.user.role;
    const portalRoutes: Record<string, string> = {
      STUDENT: ROUTES.PARENT,
      TEACHER: ROUTES.TEACHER,
      SCHOOLADMIN: ROUTES.SCHOOLADMIN,
      SUPERADMIN: ROUTES.SUPERADMIN,
    };

    const portalRoute = portalRoutes[role];
    const isPortalPath = ["/parent", "/teacher", "/schooladmin", "/superadmin", "/chairman"].some(
      (prefix) => pathname?.startsWith(prefix)
    );
    if (portalRoute && isPortalPath) {
      // Redirect to portal dashboard
      router.push(portalRoute + "?tab=dashboard");
    }
  };

  return (
    <button
      onClick={handleClick}
      className="text-base sm:text-lg md:text-xl font-bold text-gray-100 m-1 hover:text-white transition cursor-pointer text-left truncate"
      title="Click to go to dashboard"
    >
      {title}
    </button>
  );
}