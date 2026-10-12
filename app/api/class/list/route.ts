import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/school/schoolDashboardServerCache";
import { activeStudentWhere } from "@/lib/students/studentStatus";
import { getTeacherAccessibleClassIds } from "@/lib/teacher/teacherClassAccess";
import { logger } from "@/lib/logger";
import { schoolIdViaTeacherClass, schoolIdViaAdminRelation } from "@/lib/auth/tenant";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

async function resolveSchoolId(session: { user: { id: string; schoolId?: string | null; role: string } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId && session.user.role === "TEACHER") {
    schoolId = await schoolIdViaTeacherClass(session.user.id);
    if (!schoolId) {
      const teacherSchool = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { schoolId: true },
      });
      schoolId = teacherSchool?.schoolId ?? null;
    }
  }
  if (!schoolId) {
    schoolId = await schoolIdViaAdminRelation(session.user.id);
  }
  return schoolId;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const schoolId = await resolveSchoolId(session);

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const lite = searchParams.get("lite") === "1";
    const wantAllClasses = searchParams.get("all") === "1";

    const where: Record<string, unknown> = {
      schoolId: schoolId,
    };

    // Teachers normally see assigned classes only; all=1 unlocks school-wide
    // lists for Exams/Marks tools that mirror school admin.
    if (session.user.role === "TEACHER" && !wantAllClasses) {
      const accessibleIds = await getTeacherAccessibleClassIds(
        session.user.id,
        schoolId
      );
      if (accessibleIds.length === 0) {
        return NextResponse.json({ classes: [] }, { status: 200 });
      }
      where.id = { in: accessibleIds };
    }

    if (lite) {
      const memKey =
        session.user.role === "TEACHER"
          ? `class:list:lite:${schoolId}:teacher:${session.user.id}:${wantAllClasses ? "all" : "assigned"}`
          : `class:list:lite:${schoolId}`;
      const cached = getSchoolDashboardServerCached<{ classes: unknown[] }>(memKey);
      if (cached) {
        return NextResponse.json(cached, { status: 200 });
      }

      const classes = await withTenantScopedClient(schoolId, (tx) =>
        tx.class.findMany({
          where,
          select: {
            id: true,
            name: true,
            section: true,
            teacherId: true,
            teacher: {
              select: {
                id: true,
                name: true,
                email: true,
                teacherId: true,
                photoUrl: true,
              },
            },
          },
          orderBy: [{ name: "asc" }, { section: "asc" }],
        })
      );
      const payload = { classes };
      // Don't cache empty teacher lists — assignments change often via Add User
      if (!(session.user.role === "TEACHER" && classes.length === 0)) {
        setSchoolDashboardServerCached(memKey, payload, 60_000);
      }
      return NextResponse.json(payload, { status: 200 });
    }

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go through
    // the app_tenant connection, restricted by RLS, not just this route's own
    // `where: { schoolId }` filter.
    const classes = await withTenantScopedClient(schoolId, (tx) =>
      tx.class.findMany({
        where,
        include: {
          teacher: {
            select: { id: true, name: true, email: true, subject: true },
          },
          _count: {
            select: {
              students: {
                where: activeStudentWhere,
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })
    );
    const classesWithTeacherId = classes.map((c) => ({
      ...c,
      teacherId: c.teacher?.id || null,
    }));

    return NextResponse.json({ classes: classesWithTeacherId }, { status: 200 });
  } catch (error: unknown) {
    logger.error("List classes error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
