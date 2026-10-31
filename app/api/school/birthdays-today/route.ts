import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { resolveSchoolAdminSchoolId } from "@/lib/school/resolveSchoolAdminSchoolId";
import { schoolIdViaStudentId } from "@/lib/auth/tenant";
import { loadBirthdaysToday, toLimitedBirthdays } from "@/lib/school/birthdaysToday";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

type Resolved = { schoolId: string; limited: boolean } | { error: string; status: number };

/**
 * Whose birthdays this caller may see is always ONE school:
 * - SCHOOLADMIN: their own school, full details.
 * - SUPERADMIN: the school named in ?schoolId=, full details (never several schools at once).
 * - STUDENT (parent/student portal): their own school, name and class only.
 */
async function resolveCaller(
  user: { id: string; role?: string; schoolId?: string | null; studentId?: string | null },
  schoolIdParam: string | null,
  session: Parameters<typeof resolveSchoolAdminSchoolId>[0]
): Promise<Resolved> {
  if (user.role === "SCHOOLADMIN") {
    const ctx = await resolveSchoolAdminSchoolId(session);
    return "error" in ctx ? ctx : { schoolId: ctx.schoolId, limited: false };
  }

  if (user.role === "SUPERADMIN") {
    if (!schoolIdParam) return { error: "schoolId is required", status: 400 };
    const school = await prisma.school.findUnique({ where: { id: schoolIdParam }, select: { id: true } });
    if (!school) return { error: "School not found", status: 404 };
    return { schoolId: school.id, limited: false };
  }

  if (user.role === "STUDENT") {
    const schoolId = user.schoolId?.trim() || (user.studentId ? await schoolIdViaStudentId(user.studentId) : null);
    if (!schoolId) return { error: "School not found in session", status: 400 };
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, isActive: true } });
    if (!school) return { error: "School not found", status: 400 };
    if (school.isActive === false) {
      return { error: "Your school's Timelly access is deactivated. Please contact Timelly support.", status: 403 };
    }
    return { schoolId: school.id, limited: true };
  }

  return { error: "Not allowed to view birthdays", status: 403 };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const schoolIdParam = new URL(request.url).searchParams.get("schoolId")?.trim() || null;
    const ctx = await resolveCaller(session.user, schoolIdParam, session);
    if ("error" in ctx) {
      return NextResponse.json({ message: ctx.error }, { status: ctx.status });
    }

    const full = await runInTenantScope(ctx.schoolId, () => loadBirthdaysToday(prisma, ctx.schoolId));
    const payload = ctx.limited ? toLimitedBirthdays(full) : full;
    // The answer changes at midnight, so never let a browser or CDN hold it.
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    logger.error("Birthdays today error:", error);
    const message = toClientErrorMessage(error, "Internal server error");
    return NextResponse.json({ message }, { status: 500 });
  }
}
