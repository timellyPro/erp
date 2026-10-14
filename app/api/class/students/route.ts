import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { activeStudentWhere } from "@/lib/students/studentStatus";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");

    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
    }
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const where: {
      schoolId: string;
      classId?: string;
      status: string;
    } = {
      schoolId: schoolId,
      ...activeStudentWhere,
    };

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { schoolId }` filters above.
    const students = await withTenantScopedClient(schoolId, async (tx) => {
      if (classId) {
        // Verify class belongs to school
        const classData = await tx.class.findFirst({
          where: {
            id: classId,
            schoolId: schoolId,
          },
        });

        if (!classData) {
          return null;
        }

        where.classId = classId;
      }

      return tx.student.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, photoUrl: true },
          },
          class: {
            select: { id: true, name: true, section: true },
          },
          application: {
            select: {
              id: true,
              createdAt: true,
              admissionNo: true,
              fedenaNo: true,
              workflowStatus: true,
            },
          },
        },
        orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
      });
    });

    if (classId && students === null) {
      return NextResponse.json(
        { message: "Class not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    return NextResponse.json({ students }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Get class students error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
