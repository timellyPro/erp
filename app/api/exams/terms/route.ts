import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { ExamTermStatus } from "@prisma/client";
import { logger } from "@/lib/logger";
import { schoolIdViaTeacherClass, schoolIdViaTeacherRelation, schoolIdViaAdminRelation } from "@/lib/auth/tenant";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null; role: string };
}) {
  let schoolId = session.user.schoolId;

  if (!schoolId) {
    if (session.user.role === "TEACHER") {
      schoolId = await schoolIdViaTeacherClass(session.user.id);
      if (!schoolId) {
        schoolId = await schoolIdViaTeacherRelation(session.user.id);
      }
    }

    if (!schoolId) {
      schoolId = await schoolIdViaAdminRelation(session.user.id);
    }
  }

  return schoolId;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const role = session.user.role;
    if (role !== "SCHOOLADMIN" && role !== "TEACHER" && role !== "STUDENT") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId)
      return NextResponse.json({ message: "School not found" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const classIdParam = searchParams.get("classId");
    const status = searchParams.get("status");

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { schoolId }` filters in each branch below.
    const result = await withTenantScopedClient(schoolId, async (tx) => {
      const termInclude = {
        class: { include: { teacher: { select: { name: true } } } },
        schedules: { orderBy: { examDate: "asc" as const } },
        syllabus: {
          orderBy: { subject: "asc" as const },
          include: { units: { orderBy: { order: "asc" as const } } },
        },
        sections: { orderBy: { order: "asc" as const } },
      };

      /* ======================================================
         STUDENT
      ====================================================== */
      if (role === "STUDENT") {
        const student = await tx.student.findUnique({
          where: { userId: session.user.id },
          select: { classId: true },
        });

        if (!student?.classId) {
          return { kind: "studentNoClass" as const };
        }

        const terms = await tx.examTerm.findMany({
          where: {
            schoolId,
            classId: student.classId,
            ...(status ? { status: status as ExamTermStatus } : {}),
          },
          include: termInclude,
          orderBy: { createdAt: "desc" },
        });

        return { kind: "student" as const, terms };
      }

      /* ======================================================
         SCHOOL ADMIN / TEACHER – full school terms + classes
         (Teacher portal uses the same Exams UI as school admin.)
      ====================================================== */
      const classes = await tx.class.findMany({
        where: { schoolId },
        select: { id: true, name: true, section: true },
        orderBy: { name: "asc" },
      });

      const terms = await tx.examTerm.findMany({
        where: {
          schoolId,
          ...(classIdParam ? { classId: classIdParam } : {}),
          ...(status ? { status: status as ExamTermStatus } : {}),
        },
        include: termInclude,
        orderBy: { createdAt: "desc" },
      });

      return { kind: "schooladmin" as const, terms, classes };
    });

    if (result.kind === "studentNoClass") {
      return NextResponse.json({ message: "Student class not assigned" }, { status: 400 });
    }
    if (result.kind === "student") {
      return NextResponse.json({ terms: result.terms }, { status: 200 });
    }
    return NextResponse.json({ terms: result.terms, classes: result.classes }, { status: 200 });
  } catch (e: unknown) {
    logger.error("Exams terms GET:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

/* ======================================================
   POST – UNCHANGED
====================================================== */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const role = session.user.role;
    if (role !== "SCHOOLADMIN" && role !== "TEACHER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId)
      return NextResponse.json({ message: "School not found" }, { status: 400 });

    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : null;
    const classId = typeof body.classId === "string" ? body.classId : null;
    const status =
      (body.status as ExamTermStatus | undefined) ?? "UPCOMING";

    if (!name || !classId) {
      return NextResponse.json(
        { message: "name and classId are required" },
        { status: 400 }
      );
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    const term = await prisma.examTerm.create({
      data: { name, description, classId, status, schoolId },
      include: {
        class: { select: { id: true, name: true, section: true } },
      },
    });

    return NextResponse.json({ term }, { status: 201 });
    });
  } catch (e: unknown) {
    logger.error("Exams terms POST:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
