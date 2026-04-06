"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthLoadingFallback from "../components/common/AuthLoadingFallback";
import { useAllowedFeatures } from "@/lib/usePermissions";
import type { FeatureId } from "@/lib/features";

interface RequireFeatureProps {
  requiredFeature: string;
  children: ReactNode;
}

/**
 * Maps tab names (from URL params) to feature IDs used in the permission system.
 * This ensures that when a teacher accesses a tab, we check the correct feature permission.
 */
const TAB_TO_FEATURE_MAP: Record<string, string> = {
  dashboard: "dashboard",
  admission: "admission",
  attendance: "attendance-view",
  "attendance-view": "attendance-view",
  "attendance-mark": "attendance-mark",
  marks: "marks-view",
  "marks-view": "marks-view",
  "marks-entry": "marks-entry",
  homework: "homework",
  classes: "classes",
  students: "students",
  teachers: "teachers",
  leaves: "leaves",
  "student-leaves": "student-leaves",
  circulars: "communication",
  settings: "school",
  certificates: "certificates",
  events: "events",
  workshops: "events", // Workshops & Events tab -> events feature
  exams: "exams",
  newsfeed: "newsfeed",
  communication: "communication",
  chat: "communication", // Parent Chat tab -> communication feature
  payments: "payments",
  tc: "tc",
  school: "school",
  profile: "profile",
  "student-details": "STUDENT_DETAILS",
  "teacher-leaves": "TEACHER_LEAVES",
  "teacher-audit": "TEACHER_AUDIT",
  fees: "FEES",
} as const;

const ROLES_WITH_ALL_ACCESS = ["SUPERADMIN", "SCHOOLADMIN",] as const;

/**
 * Component that protects routes/features by checking if the current user
 * (specifically teachers) has permission to access the required feature.
 * 
 * For TEACHER role: Checks allowedFeatures from session
 * For SCHOOLADMIN/SUPERADMIN: Always allows access
 * 
 * If unauthorized, redirects to /unauthorized
 */
export default function RequireFeature({ requiredFeature, children }: RequireFeatureProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const allowedFeatures = useAllowedFeatures();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    // Wait for session to load
    if (status === "loading") {
      setIsAuthorized(null);
      return;
    }

    // If not authenticated, mark unauthorized (RequiredRoles handles redirect)
    if (status === "unauthenticated" || !session?.user) {
      setIsAuthorized(false);
      return;
    }

    const userRole = session.user.role as string;

    // SCHOOLADMIN and SUPERADMIN have access to all features
    if (ROLES_WITH_ALL_ACCESS.includes(userRole as typeof ROLES_WITH_ALL_ACCESS[number])) {
      setIsAuthorized(true);
      return;
    }

    // If no feature is required, allow access
    if (!requiredFeature || requiredFeature.trim() === "") {
      setIsAuthorized(true);
      return;
    }

    // For TEACHER role, check permissions
    if (userRole === "TEACHER") {
      // Map tab name to feature ID
      const normalizedTab = requiredFeature.toLowerCase().trim();
      // Always allow dashboard for teachers (common default feature)
      if (normalizedTab === "dashboard") {
        setIsAuthorized(true);
        return;
      }
      const featureId = TAB_TO_FEATURE_MAP[normalizedTab] || normalizedTab;

      // Check if the feature is in the allowed list
      // Also check the raw tab name as fallback for exact matches
      const hasAccess = 
        allowedFeatures.includes(featureId as FeatureId) || 
        allowedFeatures.includes(normalizedTab as FeatureId) ||
        allowedFeatures.some(f => f.toLowerCase() === normalizedTab);

      if (!hasAccess) {
        // Set unauthorized state first to prevent rendering children
        setIsAuthorized(false);
        // Do not navigate away — stay in the same portal and show an inline message
        return;
      }

      setIsAuthorized(true);
      return;
    }

    // For other roles (if any), deny by default unless explicitly allowed
    setIsAuthorized(false);
    router.replace("/unauthorized");
  }, [status, session, allowedFeatures, requiredFeature]);

  // Show loading state while checking authentication or permissions
  if (status === "loading" || status === "unauthenticated" || isAuthorized === null) {
    return <AuthLoadingFallback />;
  }

  // If not authorized, show an inline unauthorized panel (stay in portal)
  if (isAuthorized === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white/5 p-6 rounded-2xl border border-white/10 text-center">
          <h3 className="text-lg font-semibold text-white mb-2">Access Denied</h3>
          <p className="text-sm text-white/60 mb-4">You don't have permission to view this section.</p>
          <div className="flex justify-center">
            <button
              onClick={() => {
                // Navigate back to dashboard tab within the same portal
                router.push("?tab=dashboard");
              }}
              className="px-4 py-2 rounded-lg bg-lime-400 text-black font-semibold"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Only render children if authorized
  return <>{children}</>;
}
