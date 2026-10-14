import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";
import { schoolIdViaAdminRelation, schoolIdViaStudentId } from "@/lib/auth/tenant";

type Params = Promise<{ id: string }>;

const resolveSchoolId = async (session: {
  user: { id: string; schoolId?: string | null; role?: string };
}) => {
  let schoolId = session.user.schoolId ?? null;

  if (!schoolId) {
    schoolId = await schoolIdViaAdminRelation(session.user.id);

    // For students: get school from student record
    const studentId = (session.user as { studentId?: string }).studentId;
    if (!schoolId && studentId) {
      schoolId = await schoolIdViaStudentId(studentId);
    }

    if (schoolId) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { schoolId },
      });
    }
  }

  return schoolId;
};

// GET /api/teacher/[id] - Fetch teacher details
export async function GET(req: NextRequest, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const { id } = await params;

    // Real DB-level tenant isolation: read runs on the RLS-restricted connection.
    const teacher = await withTenantScopedClient(schoolId, (tx) =>
      tx.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teacherId: true,
        subject: true,
        subjects: true,
        qualification: true,
        experience: true,
        joiningDate: true,
        teacherStatus: true,
        mobile: true,
        address: true,
        photoUrl: true,
        schoolId: true,
        assignedClasses: { select: { id: true, name: true, section: true } },
      },
    })
    );

    if (!teacher || teacher.role !== "TEACHER") {
      return NextResponse.json({ message: "Teacher not found" }, { status: 404 });
    }

    if (teacher.schoolId !== schoolId) {
      return NextResponse.json(
        { message: "You do not have access to this teacher" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        teacher: {
          ...teacher,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("Teacher fetch error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
