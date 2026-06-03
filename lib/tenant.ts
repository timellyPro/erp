import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/authOptions";

export type TenantContext =
  | { ok: true; schoolId: string }
  | { ok: false; status: number; message: string };

async function resolveSchoolIdFromDb(userId: string): Promise<string | null> {
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
  const isStaff = role === "SCHOOLADMIN" || role === "SUPERADMIN" || role === "TEACHER";
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

