import bcrypt from "bcryptjs";
import { formatDobYmd } from "@/lib/dobCalendar";
import { hashStudentPasswordFromDob, passwordCandidatesFromDob } from "@/lib/students/studentDefaultPassword";

type UserDb = {
  user: {
    findUnique: (args: { where: { id: string }; select: { password: true } }) => Promise<{ password: string | null } | null>;
    update: (args: { where: { id: string }; data: { password: string } }) => Promise<unknown>;
  };
};

/**
 * Correcting a student's date of birth used to leave the login on the password made from the OLD date, so
 * the credentials page then showed "Not matching" for that student.
 *
 * If the login still uses the default from the old DOB, move it to the default from the new DOB. If the
 * student (or an admin) has set their own password, leave it alone.
 *
 *  UPDATED    the default password now follows the new DOB
 *  KEPT       the login uses a password of its own; unchanged
 *  UNCHANGED  nothing to do (same calendar date, no login, or no usable DOB)
 */
export async function refreshDefaultPasswordOnDobChange(
  db: UserDb,
  input: { userId: string; oldDob: Date | string | null | undefined; newDob: Date | string | null | undefined }
): Promise<"UPDATED" | "KEPT" | "UNCHANGED"> {
  const oldYmd = formatDobYmd(input.oldDob);
  const newYmd = formatDobYmd(input.newDob);
  if (!newYmd || oldYmd === newYmd) return "UNCHANGED";

  const user = await db.user.findUnique({ where: { id: input.userId }, select: { password: true } });
  if (!user?.password) return "UNCHANGED";

  let usesOldDefault = false;
  for (const candidate of passwordCandidatesFromDob(input.oldDob)) {
    try {
      if (await bcrypt.compare(candidate, user.password)) {
        usesOldDefault = true;
        break;
      }
    } catch {
      /* invalid hash: treat as a password of its own */
    }
  }
  if (!usesOldDefault) return "KEPT";

  await db.user.update({ where: { id: input.userId }, data: { password: await hashStudentPasswordFromDob(input.newDob) } });
  return "UPDATED";
}
