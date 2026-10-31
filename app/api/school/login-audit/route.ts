import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { resolveSchoolAdminSchoolId } from "@/lib/school/resolveSchoolAdminSchoolId";
import { loadLoginAudit, parseLoginAuditFilters } from "@/lib/school/loginAudit";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/**
 * Sign-in history of the school admin's own school: who logged in (teachers, parents / students,
 * admin staff), when, and from which device. School admins only; the school always comes from
 * the session, never from the request.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "SCHOOLADMIN") {
    return NextResponse.json({ message: "Only school admins can view the login audit" }, { status: 403 });
  }

  try {
    const filters = parseLoginAuditFilters(new URL(request.url).searchParams);
    if ("error" in filters) {
      return NextResponse.json({ message: filters.error }, { status: 400 });
    }

    const ctx = await resolveSchoolAdminSchoolId(session);
    if ("error" in ctx) {
      return NextResponse.json({ message: ctx.error }, { status: ctx.status });
    }

    const page = await runInTenantScope(ctx.schoolId, () => loadLoginAudit(prisma, ctx.schoolId, filters));
    return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    logger.error("Login audit error:", error);
    const message = toClientErrorMessage(error, "Internal server error");
    return NextResponse.json({ message }, { status: 500 });
  }
}
