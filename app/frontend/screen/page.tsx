"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ROUTES } from "../constants/routes";

export default function ScreenPage() {
    const router = useRouter();
    const { data: session, status } = useSession();

    // Single effect - only one source of redirect logic
    useEffect(() => {
        // Wait for session to load
        if (status === "loading") {
            return;
        }

        // Not logged in -> send to login
        if (status === "unauthenticated") {
            router.replace("/");
            return;
        }

        // Logged in -> redirect by role
        if (status === "authenticated" && session?.user) {
            const roleRoutes: Record<string, string> = {
                SUPERADMIN: ROUTES.SUPERADMIN,
                SCHOOLADMIN: ROUTES.SCHOOLADMIN,
                CHAIRMAN: ROUTES.CHAIRMAN,
                STUDENT: ROUTES.PARENT,
                TEACHER: ROUTES.TEACHER,
            };

            router.replace(roleRoutes[session.user.role] || "/unauthorized");
        }
    }, [status, session, router]);

    if (status === "loading") {
        return null;
    }

    return null;
}
