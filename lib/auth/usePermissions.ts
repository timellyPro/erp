"use client";

import { useSession } from "next-auth/react";
import { FEATURE_IDS, getDefaultFeaturesForRole, type FeatureId } from "@/lib/features";

const ROLES_WITH_ALL_ACCESS = ["SUPERADMIN", "SCHOOLADMIN"];

/**
 * Returns whether the current user has access to the given feature.
 * SUPERADMIN and SCHOOLADMIN have access to all features.
 * Others use allowedFeatures from session (set when user was created).
 */
export function useHasFeature(featureId: FeatureId): boolean {
  const { data: session, status } = useSession();
  if (status !== "authenticated" || !session?.user) return false;

  const role = session.user.role as string;
  if (ROLES_WITH_ALL_ACCESS.includes(role)) return true;

  const allowed = (session.user as { allowedFeatures?: string[] }).allowedFeatures;
  if (!allowed || !Array.isArray(allowed)) return true; // legacy: no list = allow all for role
  return allowed.includes(featureId);
}

/**
 * Returns the list of feature ids the current user is allowed to access.
 */
export function useAllowedFeatures(): FeatureId[] {
  const { data: session, status } = useSession();
  if (status !== "authenticated" || !session?.user) return [];

  const role = session.user.role as string;
  if (ROLES_WITH_ALL_ACCESS.includes(role)) {
    return [...FEATURE_IDS];
  }

  const allowed = (session.user as { allowedFeatures?: string[] }).allowedFeatures;
  if (!allowed || !Array.isArray(allowed)) {
    return getDefaultFeaturesForRole("TEACHER");
  }
  return allowed as FeatureId[];
}
