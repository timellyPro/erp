import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInOptionalTenantScope } from "@/lib/db/tenantContext";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";
import {
  schoolIdViaStudentId,
  schoolIdViaTeacherClass,
  schoolIdViaTeacherRelation,
  schoolIdViaAdminRelation,
} from "@/lib/auth/tenant";

async function resolveSchoolId(session: { user: { id: string; schoolId?: string | null; role: string; studentId?: string | null } }) {
  if (session.user.schoolId) return session.user.schoolId;

  if (session.user.role === "STUDENT" && session.user.studentId) {
    return schoolIdViaStudentId(session.user.studentId);
  }

  if (session.user.role === "TEACHER") {
    const viaClass = await schoolIdViaTeacherClass(session.user.id);
    if (viaClass) return viaClass;
    return schoolIdViaTeacherRelation(session.user.id);
  }

  return schoolIdViaAdminRelation(session.user.id);
}

// GET: list appointments for current user (student or teacher)
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const role = session.user.role;
    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found in session" }, { status: 400 });
    }

    let where: Prisma.AppointmentWhereInput = {};

  if (role === "STUDENT") {
    if (!session.user.studentId) {
      return NextResponse.json(
        { message: "Student profile not found" },
        { status: 400 }
      );
    }
    where.studentId = session.user.studentId;
  } else if (role === "TEACHER") {
    where.teacherId = userId;
  } else {
    return NextResponse.json(
      { message: "Only students or teachers can view appointments" },
      { status: 403 }
    );
  }
    where.schoolId = schoolId;
    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): read goes
    // through the app_tenant connection, restricted by RLS, not just the
    // `where.schoolId` filter above.
    const appointments = await withTenantScopedClient(schoolId, (tx) =>
      tx.appointment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          student: {
            select: {
              id: true,
              fatherName: true,
              user: { select: { name: true, photoUrl: true } },
            },
          },
          teacher: {
            select: {
              id: true,
              name: true,
              photoUrl: true,
              subject: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" as const },
            select: { content: true },
          },
        },
      })
    );

    return NextResponse.json({ appointments });
  } catch (error: unknown) {
    logger.error("List appointments error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: create appointment (student)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "STUDENT") {
    return NextResponse.json(
      { message: "Only students can request appointments" },
      { status: 403 }
    );
  }

  try {
    return await runInOptionalTenantScope(session.user.schoolId, async () => {
    const createAppointmentBodySchema = z.object({
      teacherId: z.string().optional(),
      scheduledAt: z.string().optional().nullable(),
      note: z.string().optional().nullable(),
    });
    const parsedBody = createAppointmentBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "teacherId is required" }, { status: 400 });
    }
    const { teacherId, scheduledAt, note } = parsedBody.data;

    if (!teacherId) {
      return NextResponse.json(
        { message: "teacherId is required" },
        { status: 400 }
      );
    }

    if (!session.user.studentId) {
      return NextResponse.json(
        { message: "Student profile not found" },
        { status: 400 }
      );
    }

    if (!session.user.schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    // Prevent cross-tenant appointment creation: teacher must belong to same school.
    const teacher = await prisma.user.findUnique({
      where: { id: teacherId },
      select: {
        id: true,
        role: true,
        schoolId: true,
        teacherSchools: { select: { id: true } },
      },
    });
    const teacherSchoolIds = new Set([
      teacher?.schoolId ?? "",
      ...(teacher?.teacherSchools?.map((s) => s.id) ?? []),
    ].filter(Boolean));
    if (!teacher || teacher.role !== "TEACHER" || !teacherSchoolIds.has(session.user.schoolId)) {
      return NextResponse.json(
        { message: "Selected teacher is not part of your school" },
        { status: 400 }
      );
    }

    const appointment = await prisma.appointment.create({
      data: {
        studentId: session.user.studentId,
        teacherId,
        schoolId: session.user.schoolId,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        note: note || null,
        status: "PENDING",
      },
    });

    return NextResponse.json(
      { message: "Appointment requested", appointment },
      { status: 201 }
    );
    });
  } catch (error: unknown) {
    logger.error("Create appointment error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}

