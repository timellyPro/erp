"use client";

import { useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/app/frontend/constants/routes";
import LoginForm from "@/components/auth/LoginForm";
import { shouldForceSuperAdminRelogin } from "@/lib/superAdminBrowserSession";
export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;

    const role = session.user.role;

    // Stale cookie: SuperAdminSessionGuard will sign out; stay on login until then.
    if (role === "SUPERADMIN" && shouldForceSuperAdminRelogin()) {
      return;
    }

    switch (role) {      case "SUPERADMIN":
        router.replace(ROUTES.SUPERADMIN);
        break;
      case "SCHOOLADMIN":
        router.replace(ROUTES.SCHOOLADMIN);
        break;
      case "TEACHER":
        router.replace(ROUTES.TEACHER);
        break;
      case "STUDENT":
        router.replace(ROUTES.PARENT);
        break;
      default:
        router.replace(ROUTES.UNAUTHORIZED);
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 backdrop-blur-xl border border-white/20">
              <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">Loading</h2>
          <p className="text-gray-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (status === "authenticated") {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <Suspense fallback={<div className="text-white/60">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
