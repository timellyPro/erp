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
    const { term, syllabus } = await withTenantScopedClient(schoolId, async (tx) => {
      const t = await tx.examTerm.findFirst({
        where: { id, schoolId },
        select: { id: true },
      });
      if (!t) return { term: null, syllabus: [] };

      const s = await tx.syllabusTracking.findMany({
        where: { termId: id },
        orderBy: { subject: "asc" },
      });
      return { term: t, syllabus: s };
    });
    if (!term) return NextResponse.json({ message: "Exam term not found" }, { status: 404 });

    return NextResponse.json({ syllabus }, { status: 200 });
  } catch (e: unknown) {
    logger.error("Exams syllabus GET:", e);
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
    const completedPercentRaw = Number(body.completedPercent ?? 0);
    const notes =
      typeof body.notes === "string" && body.notes.trim().length > 0
        ? body.notes.trim()
        : null;

    if (!subject) {
      return NextResponse.json({ message: "subject is required" }, { status: 400 });
    }

    const completedPercent = Math.max(0, Math.min(100, Math.trunc(completedPercentRaw)));

    const record = await prisma.syllabusTracking.upsert({
      where: {
        termId_subject: {
          termId: id,
          subject,
        },
      },
      create: {
        termId: id,
        subject,
        completedPercent,
        notes,
      },
      update: {
        completedPercent,
        notes,
      },
    });

    return NextResponse.json({ record }, { status: 201 });
    });
  } catch (e: unknown) {
    logger.error("Exams syllabus POST:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

