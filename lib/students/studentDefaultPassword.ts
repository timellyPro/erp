import bcrypt from "bcryptjs";

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

/** All plausible default passwords for a stored DOB (UTC vs local can differ by 1 day). */
export function passwordCandidatesFromDob(
  dob: Date | string | null | undefined
): string[] {
  const date = toDate(dob);
  if (!date) return [];
  const utc = formatDobPasswordUtc(date);
  const local = formatDobPasswordLocal(date);
  return utc === local ? [utc] : [utc, local];
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
