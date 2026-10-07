"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthLoadingFallback from "../components/common/AuthLoadingFallback";
import { useAllowedFeatures } from "@/lib/usePermissions";

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
  marks: "MARKS",
  "marks-view": "MARKS",
  "marks-entry": "MARKS",
  homework: "homework",
  timetable: "timetable",
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
  exams: "EXAMS",
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

/** Extra aliases accepted for a given tab (legacy FeatureIds + Permission enums). */
const TAB_FEATURE_ALIASES: Record<string, string[]> = {
  marks: ["MARKS", "marks", "marks-view", "marks-entry"],
  exams: ["EXAMS", "exams"],
  attendance: ["ATTENDANCE", "attendance", "attendance-view", "attendance-mark"],
  workshops: ["WORKSHOPS", "workshops", "events"],
  chat: ["CHAT", "chat", "communication"],
  circulars: ["CIRCULARS", "circulars", "communication"],
  settings: ["SETTINGS", "settings", "school"],
  homework: ["HOMEWORK", "homework"],
  timetable: ["TIMETABLE", "timetable"],
  classes: ["CLASSES", "classes"],
  students: ["STUDENTS", "students"],
  teachers: ["TEACHERS", "teachers"],
  leaves: ["LEAVES", "leaves"],
  admission: ["ADMISSION", "admission"],
  newsfeed: ["NEWSFEED", "newsfeed"],
  profile: ["PROFILE", "profile"],
  certificates: ["CERTIFICATES", "certificates"],
  fees: ["FEES", "fees"],
  "student-details": ["STUDENT_DETAILS", "student-details"],
  "teacher-leaves": ["TEACHER_LEAVES", "teacher-leaves"],
  "teacher-audit": ["TEACHER_AUDIT", "teacher-audit"],
};

function teacherHasFeatureAccess(allowedFeatures: string[], requiredFeature: string): boolean {
  const normalizedTab = requiredFeature.toLowerCase().trim();
  if (!normalizedTab) return true;
  if (normalizedTab === "dashboard") return true;

  const featureId = TAB_TO_FEATURE_MAP[normalizedTab] || normalizedTab;
  const aliases = TAB_FEATURE_ALIASES[normalizedTab] ?? [];
  const accepted = new Set(
    [featureId, normalizedTab, ...aliases].map((k) => k.toLowerCase())
  );

  return allowedFeatures.some((f) => accepted.has(String(f).toLowerCase()));
}

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
      if (teacherHasFeatureAccess(allowedFeatures as string[], requiredFeature)) {
        setIsAuthorized(true);
        return;
      }

      // Set unauthorized state first to prevent rendering children
      setIsAuthorized(false);
      // Do not navigate away — stay in the same portal and show an inline message
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
