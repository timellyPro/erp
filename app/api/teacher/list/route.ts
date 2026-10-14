import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/school/schoolDashboardServerCache";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let schoolId = session.user.schoolId;

    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
      if (!schoolId && (session.user as { studentId?: string }).studentId) {
        const student = await prisma.student.findUnique({
          where: { id: (session.user as { studentId: string }).studentId },
          select: { schoolId: true },
        });
        schoolId = student?.schoolId ?? null;
      }
      if (schoolId) {
        prisma.user.update({
          where: { id: session.user.id },
          data: { schoolId },
        }).catch(() => {});
      }
    }

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const cacheKey = `teacher:list:${schoolId}`;
    const cached = getSchoolDashboardServerCached<{ teachers: unknown[] }>(cacheKey);
    if (cached?.teachers) {
      return NextResponse.json(cached, { status: 200 });
    }

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): read goes
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { schoolId }` filter above.
    const teachers = await withTenantScopedClient(schoolId, (tx) =>
      tx.user.findMany({
        where: {
          schoolId: schoolId,
          role: "TEACHER",
        },
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
          teacherId: true,
          subject: true,
          photoUrl: true,
        },
        orderBy: {
          name: "asc",
        },
      })
    );

    const payload = { teachers };
    setSchoolDashboardServerCached(cacheKey, payload, 60_000);
    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    logger.error("List teachers error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
