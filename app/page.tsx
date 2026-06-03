"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ROUTES } from "@/app/frontend/constants/routes";
import { hasSuperAdminBrowserSession } from "@/lib/superAdminBrowserSession";
import Spinner from "./frontend/components/common/Spinner";
import LoginForm from "./frontend/auth/LoginForm";

export default function Home() {
  const router = useRouter();
  const { status, data: session } = useSession();
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    // Only redirect if we have a confirmed authenticated status with a valid role
    // Never redirect to /unauthorized from home page
    if (status === "authenticated" && session?.user?.role && !hasRedirected) {
      if (session.user.role === "SUPERADMIN" && !hasSuperAdminBrowserSession()) {
        void signOut({ redirect: false });
        return;
      }

      const roleRoutes: Record<string, string> = {
        SUPERADMIN: ROUTES.SUPERADMIN,
        SCHOOLADMIN: ROUTES.SCHOOLADMIN,
        STUDENT: ROUTES.PARENT,
        TEACHER: ROUTES.TEACHER,
      };
      
      const destination = roleRoutes[session.user.role];
      
      // Only redirect if we have a valid destination
      // If role doesn't match, stay on home page (don't redirect to unauthorized)
      if (destination) {
        setHasRedirected(true);
        router.replace(destination);
      }
    }
  }, [status, session?.user?.role, router, hasRedirected]);

  // Always show login form for unauthenticated users
  // Show loading only while checking session
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 backdrop-blur-xl border border-white/20">
              <Spinner/>
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">Loading</h2>
          <p className="text-gray-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // If authenticated but redirecting, show loading
  if (status === "authenticated" && session?.user?.role && hasRedirected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 backdrop-blur-xl border border-white/20">
              <Spinner/>
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">Redirecting</h2>
          <p className="text-gray-400">Taking you to your dashboard...</p>
        </div>
      </div>
    );
  }

  // Show login form for everyone else (unauthenticated or authenticated without valid role)
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <LoginForm />
    </div>
  );
}
