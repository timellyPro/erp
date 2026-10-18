import bcrypt from "bcryptjs";
import { formatDobYmd } from "@/lib/dobCalendar";

function toDate(dob: Date | string | null | undefined): Date | null {
  if (!dob) return null;
  const date = dob instanceof Date ? dob : new Date(dob);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** UTC calendar date — matches legacy create / bulk-upload password hashing. */
export function formatDobPasswordUtc(date: Date): string {
  return date.toISOString().split("T")[0].replace(/-/g, "");
}

/** Local calendar date — matches what admins see on DOB fields in India. */
export function formatDobPasswordLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** India calendar date: the DOB exactly as the app shows it (see lib/dobCalendar.ts). */
export function formatDobPasswordIst(date: Date): string {
  return formatDobYmd(date).replace(/-/g, "");
}

/**
 * All plausible default passwords for a stored DOB. UTC, server-local and India dates can differ by a day
 * for a DOB that was saved as local midnight; the India one is what the screens show, so a password
 * typed or generated from the displayed DOB is recognised too.
 */
export function passwordCandidatesFromDob(
  dob: Date | string | null | undefined
): string[] {
  const date = toDate(dob);
  if (!date) return [];
  return [...new Set([formatDobPasswordUtc(date), formatDobPasswordLocal(date), formatDobPasswordIst(date)])];
}

/** Legacy alias used at student creation time (UTC). */
export function studentDefaultPasswordFromDob(
  dob: Date | string | null | undefined
): string {
  const date = toDate(dob);
  if (!date) return "";
  return formatDobPasswordUtc(date);
}

/** Password set on admin reset — local calendar DOB (what students expect). */
export function canonicalStudentPasswordFromDob(
  dob: Date | string | null | undefined
): string {
  const date = toDate(dob);
  if (!date) return "";
  return formatDobPasswordLocal(date);
}

/**
 * Why a password can or cannot be shown:
 *  DEFAULT   the login still uses the DOB default, so it can be shown
 *  CUSTOM    the login uses some other password (changed by the student or an admin, or set from a
 *            different DOB before the DOB was corrected); only a hash is stored, so it cannot be shown
 *  NO_LOGIN  the account has no password (deactivated)
 *  NO_DOB    there is no usable date of birth to derive a default from
 */
export type StudentPasswordState = "DEFAULT" | "CUSTOM" | "NO_LOGIN" | "NO_DOB";

export async function resolveStudentPasswordState(
  dob: Date | string | null | undefined,
  passwordHash: string | null | undefined
): Promise<{ password: string; verified: boolean; state: StudentPasswordState }> {
  if (!passwordHash) return { password: "", verified: false, state: "NO_LOGIN" };
  if (passwordCandidatesFromDob(dob).length === 0) {
    return { password: "", verified: false, state: "NO_DOB" };
  }
  const resolved = await resolveVerifiedStudentPassword(dob, passwordHash);
  return { ...resolved, state: resolved.verified ? "DEFAULT" : "CUSTOM" };
}

export async function resolveVerifiedStudentPassword(
  dob: Date | string | null | undefined,
  passwordHash: string | null | undefined
): Promise<{ password: string; verified: boolean }> {
  if (!passwordHash) {
    return { password: "", verified: false };
  }

  for (const candidate of passwordCandidatesFromDob(dob)) {
    try {
      if (await bcrypt.compare(candidate, passwordHash)) {
        return { password: candidate, verified: true };
      }
    } catch {
      /* invalid hash */
    }
  }

  return {
    password: canonicalStudentPasswordFromDob(dob),
    verified: false,
  };
}

export async function hashStudentPasswordFromDob(
  dob: Date | string | null | undefined
): Promise<string> {
  const plain = canonicalStudentPasswordFromDob(dob);
  if (!plain) throw new Error("Invalid date of birth");
  return bcrypt.hash(plain, 10);
}
