import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth/authOptions";

export type TenantContext =
  | { ok: true; schoolId: string }
  | { ok: false; status: number; message: string };

async function resolveSchoolIdFromDb(userId: string): Promise<string | null> {
  // A transient DB error here must not throw: callers treat a null return as
  // "couldn't resolve school" and respond with a normal 400, instead of the
  // request blowing up with an uncaught 500 on a DB blip.
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        schoolId: true,
        student: { select: { schoolId: true } },
        adminSchools: { select: { id: true } },
        teacherSchools: { select: { id: true } },
      },
    });
    return (
      u?.schoolId ??
      u?.student?.schoolId ??
      u?.adminSchools?.[0]?.id ??
      u?.teacherSchools?.[0]?.id ??
      null
    );
  } catch (error) {
    console.error("resolve_school_id_from_db_failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Strict tenant resolution for staff endpoints. Never returns null for a valid staff user.
 * - Does NOT allow "missing schoolId => query without tenant filter".
 * - Uses DB as source of truth when session token is missing/old.
 */
export async function requireSchoolId(session: Session): Promise<TenantContext> {
  const user = session?.user as { id?: string; role?: string; schoolId?: string | null } | undefined;
  if (!user?.id) return { ok: false, status: 401, message: "Unauthorized" };

  const role = user.role;
  const isStaff = role === "SCHOOLADMIN" || role === "SUPERADMIN" || role === "CHAIRMAN" || role === "TEACHER";
  if (!isStaff) return { ok: false, status: 403, message: "Forbidden" };

  const fromToken = typeof user.schoolId === "string" && user.schoolId.trim() ? user.schoolId : null;
  const schoolId = fromToken ?? (await resolveSchoolIdFromDb(user.id));
  if (!schoolId) return { ok: false, status: 400, message: "School not found in session" };
  return { ok: true, schoolId };
}

/**
 * Helper for routes that require an authenticated session.
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false as const, status: 401 as const, message: "Unauthorized" };
  return { ok: true as const, session };
}

/**
 * Shared fallback primitives for routes with their own bespoke `resolveSchoolId`
 * (looser than {@link requireSchoolId}: callers decide which fallbacks apply and
 * in what order, and may tolerate a null result). Extracted only to remove
 * duplicated Prisma calls — each route still composes its own fallback chain,
 * so behavior per route is unchanged.
 */
export async function schoolIdViaStudentId(studentId: string): Promise<string | null> {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { schoolId: true } });
  return st?.schoolId ?? null;
}

export async function schoolIdViaTeacherClass(teacherId: string): Promise<string | null> {
  const teacherClass = await prisma.class.findFirst({ where: { teacherId }, select: { schoolId: true } });
  return teacherClass?.schoolId ?? null;
}

export async function schoolIdViaTeacherRelation(teacherId: string): Promise<string | null> {
  const teacherSchool = await prisma.school.findFirst({
    where: { teachers: { some: { id: teacherId } } },
    select: { id: true },
  });
  return teacherSchool?.id ?? null;
}

export async function schoolIdViaAdminRelation(adminId: string): Promise<string | null> {
  const adminSchool = await prisma.school.findFirst({
    where: { admins: { some: { id: adminId } } },
    select: { id: true },
  });
  return adminSchool?.id ?? null;
}

