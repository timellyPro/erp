import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";
import type { StudentDetailsTabPayload } from "@/lib/buildStudentDetailsTabPayload";

export type StudentDetailsBundle = StudentDetailsTabPayload & {
  feeBreakdown: AdminStudentFeeBreakdownResult | null;
};

function parseProfileBundle(data: unknown): StudentDetailsTabPayload {
  if (!(data as { student?: unknown })?.student) {
    throw new Error("Invalid student details response");
  }
  const { feeBreakdown: _fb, ...rest } = data as StudentDetailsBundle;
  return rest;
}

/** Profile loads first; fee breakdown follows (no school-wide DB cleanup on read). */
export async function loadStudentDetailsBundle(
  studentId: string,
  options?: {
    onProfileLoaded?: (bundle: StudentDetailsBundle) => void;
  }
): Promise<StudentDetailsBundle> {
  const profileRes = await fetch(
    `/api/student/${encodeURIComponent(studentId)}/details-bundle?profileOnly=1`,
    { credentials: "include", cache: "no-store" }
  );
  const profileData = await profileRes.json().catch(() => ({}));
  if (!profileRes.ok) {
    throw new Error(
      (profileData as { message?: string })?.message || "Failed to load student details"
    );
  }

  const profile = parseProfileBundle(profileData);
  const profileBundle: StudentDetailsBundle = { ...profile, feeBreakdown: null };
  options?.onProfileLoaded?.(profileBundle);

  const breakdownRes = await fetch(
    `/api/fees/admin/breakdown?studentId=${encodeURIComponent(studentId)}&fast=1`,
    { credentials: "include", cache: "no-store" }
  );
  if (!breakdownRes.ok) {
    return profileBundle;
  }

  const breakdown = (await breakdownRes.json().catch(() => null)) as
    | AdminStudentFeeBreakdownResult
    | null;
  if (!breakdown?.studentId) {
    return profileBundle;
  }

  return { ...profile, feeBreakdown: breakdown };
}
