import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { logger } from "@/lib/logger";
import { schoolIdViaTeacherClass, schoolIdViaTeacherRelation, schoolIdViaAdminRelation } from "@/lib/auth/tenant";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

async function resolveSchoolId(session: { user: { id: string; schoolId?: string | null; role: string } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId && session.user.role === "TEACHER") {
    schoolId = await schoolIdViaTeacherClass(session.user.id);
    if (!schoolId) {
      schoolId = await schoolIdViaTeacherRelation(session.user.id);
    }
  }
  if (!schoolId) {
    schoolId = await schoolIdViaAdminRelation(session.user.id);
  }
  return schoolId;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "TEACHER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const { id } = await params;
    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { schoolId }` filter above.
    const { term, schedules } = await withTenantScopedClient(schoolId, async (tx) => {
      const t = await tx.examTerm.findFirst({
        where: { id, schoolId },
        select: { id: true },
      });
      if (!t) return { term: null, schedules: [] };

      const s = await tx.examSchedule.findMany({
        where: { termId: id },
        orderBy: { examDate: "asc" },
      });
      return { term: t, schedules: s };
    });
    if (!term) return NextResponse.json({ message: "Exam term not found" }, { status: 404 });

    return NextResponse.json({ schedules }, { status: 200 });
  } catch (e: unknown) {
    logger.error("Exams schedule GET:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "TEACHER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });
    return await runInTenantScope(schoolId, async (schoolId) => {

    const { id } = await params;
    const term = await prisma.examTerm.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!term) return NextResponse.json({ message: "Exam term not found" }, { status: 404 });

    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const examDate = body.examDate ? new Date(body.examDate as string) : null;
    const startTime = typeof body.startTime === "string" ? body.startTime.trim() : "";
    const durationMin = Number(body.durationMin);

    if (!subject || !examDate || isNaN(examDate.getTime()) || !startTime || !Number.isFinite(durationMin)) {
      return NextResponse.json(
        { message: "subject, examDate, startTime and durationMin are required" },
        { status: 400 }
      );
    }

    const schedule = await prisma.examSchedule.create({
      data: {
        termId: id,
        subject,
        examDate,
        startTime,
        durationMin: Math.trunc(durationMin),
      },
    });

    return NextResponse.json({ schedule }, { status: 201 });
    });
  } catch (e: unknown) {
    logger.error("Exams schedule POST:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

