import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

/** Roles whose sign-ins are kept in a school's login audit (SUPERADMIN has no school). */
const SCHOOL_ROLES = new Set(["SCHOOLADMIN", "CHAIRMAN", "TEACHER", "STUDENT"]);

const MAX_USER_AGENT = 500;

type Headers = Record<string, string | string[] | undefined> | undefined;

function header(headers: Headers, name: string): string | null {
  const v = headers?.[name];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

/** First address in x-forwarded-for (the client, as set by the hosting proxy), else x-real-ip. */
export function clientIp(headers: Headers): string | null {
  const forwarded = header(headers, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || null;
  return header(headers, "x-real-ip");
}

export type LoginAuditUser = {
  id: string;
  role: string;
  name: string | null;
  email: string | null;
  schoolId: string | null;
  studentId: string | null;
};

/**
 * Writes one LoginAuditLog row for a successful sign-in. Never throws: a failed audit
 * write must not block someone from logging in. Uses the owner connection because
 * there is no tenant scope at sign-in (auth/[...nextauth] is an owner-connection route).
 */
export async function recordLogin(user: LoginAuditUser, headers: Headers): Promise<void> {
  if (!user.schoolId || !SCHOOL_ROLES.has(user.role)) return;
  try {
    await prisma.loginAuditLog.create({
      data: {
        schoolId: user.schoolId,
        userId: user.id,
        studentId: user.studentId,
        role: user.role,
        name: user.name,
        email: user.email,
        ipAddress: clientIp(headers),
        userAgent: header(headers, "user-agent")?.slice(0, MAX_USER_AGENT) ?? null,
      },
    });
  } catch (error) {
    logger.error("login_audit_write_failed", error instanceof Error ? error.message : error);
  }
}
