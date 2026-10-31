import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { resolveSchoolAdminSchoolId } from "@/lib/school/resolveSchoolAdminSchoolId";
import { loadBirthdaysToday } from "@/lib/school/birthdaysToday";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  if (!isAdmin) {
    return NextResponse.json({ message: "Only admins can view birthdays" }, { status: 403 });
  }

  try {
    const ctx = await resolveSchoolAdminSchoolId(session);
    if ("error" in ctx) {
      return NextResponse.json({ message: ctx.error }, { status: ctx.status });
    }
    const schoolId = ctx.schoolId;

    const payload = await runInTenantScope(schoolId, () => loadBirthdaysToday(prisma, schoolId));
    // The answer changes at midnight, so never let a browser or CDN hold it.
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    logger.error("Birthdays today error:", error);
    const message = toClientErrorMessage(error, "Internal server error");
    return NextResponse.json({ message }, { status: 500 });
  }
}
