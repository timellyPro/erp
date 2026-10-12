import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { TeacherAuditCategory } from "@prisma/client";
import { logger } from "@/lib/logger";
import { schoolIdViaAdminRelation } from "@/lib/auth/tenant";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/* ================= HELPERS ================= */
const SCORE_BASELINE = 50;
const clampScore = (value: number) => Math.max(0, Math.min(100, value));

async function resolveSchoolId(session: { user: { id: string; schoolId?: string | null } }) {
  return session.user.schoolId ?? (await schoolIdViaAdminRelation(session.user.id));
}

function academicYearRange(academicYear: string): { start: Date; end: Date } | null {
  const m = academicYear.match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;
  const startYear = parseInt(m[1], 10);
  return {
    start: new Date(startYear, 5, 1, 0, 0, 0),
    end: new Date(startYear + 1, 4, 31, 23, 59, 59),
  };
}

function createdAtForAcademicYear(academicYear: string): Date | undefined {
  const range = academicYearRange(academicYear);
  if (!range) return undefined;
  const now = new Date();
  if (now >= range.start && now <= range.end) return now;
  return new Date(range.start.getTime() + 24 * 60 * 60 * 1000);
}
/* =========================================== */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ teacherId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
    const hasFeature = session.user.role === "TEACHER" && session.user.allowedFeatures?.includes("TEACHER_AUDIT");
    if (!isAdmin && !hasFeature) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { teacherId } = await params;
    const schoolId = await resolveSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    return await runInTenantScope(schoolId, async () => {
    const teacher = await prisma.user.findFirst({
      where: { id: teacherId, schoolId, role: "TEACHER" },
      select: { id: true },
    });
    if (!teacher) return NextResponse.json({ message: "Teacher not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const take = Math.min(100, Number(searchParams.get("take") || 50));
    const academicYear = searchParams.get("academicYear")?.trim() ?? "";

    const range = academicYear ? academicYearRange(academicYear) : null;
    const dateRange = range ? { gte: range.start, lte: range.end } : undefined;

    const where = dateRange
      ? { teacherId, createdAt: dateRange }
      : { teacherId };

    const records = await prisma.teacherAuditRecord.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    const agg = await prisma.teacherAuditRecord.aggregate({
      where,
      _sum: { scoreImpact: true },
      _count: { _all: true },
    });

    const performanceScore = clampScore(SCORE_BASELINE + (agg._sum.scoreImpact ?? 0));

    return NextResponse.json(
      {
        records,
        performanceScore,
        recordCount: agg._count._all,
      },
      { status: 200 }
    );
    });
  } catch (e: unknown) {
    logger.error("Teacher audit records GET:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ teacherId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
    const hasFeature = session.user.role === "TEACHER" && session.user.allowedFeatures?.includes("TEACHER_AUDIT");
    if (!isAdmin && !hasFeature) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { teacherId } = await params;
    const schoolId = await resolveSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });
    return await runInTenantScope(schoolId, async (schoolId) => {

    const teacher = await prisma.user.findFirst({
      where: { id: teacherId, schoolId, role: "TEACHER" },
      select: { id: true },
    });
    if (!teacher) return NextResponse.json({ message: "Teacher not found" }, { status: 404 });

    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;

    const rawCategory = body.category as TeacherAuditCategory | undefined;

const category: TeacherAuditCategory =
  rawCategory &&
  Object.values(TeacherAuditCategory).includes(rawCategory)
    ? rawCategory
    : "CUSTOM";

    const customCategory =
      typeof body.customCategory === "string"
        ? body.customCategory.trim()
        : null;
    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";
    const scoreImpact = Number(body.scoreImpact);

    const academicYear = typeof body.academicYear === "string" ? body.academicYear.trim() : "";
    const range = academicYear ? academicYearRange(academicYear) : null;
    const dateRange = range ? { gte: range.start, lte: range.end } : undefined;

    /* ---------- BASIC VALIDATIONS ---------- */
   

    if (category === "CUSTOM" && !customCategory) {
      return NextResponse.json(
        { message: "customCategory is required for CUSTOM" },
        { status: 400 }
      );
    }

    // if (!description) {
    //   return NextResponse.json(
    //     { message: "description is required" },
    //     { status: 400 }
    //   );
    // }

    if (!Number.isFinite(scoreImpact)) {
      return NextResponse.json(
        { message: "scoreImpact must be a valid number" },
        { status: 400 }
      );
    }

    /* ---------- SCORE SAFETY LOGIC ---------- */

    const agg = await prisma.teacherAuditRecord.aggregate({
      where: dateRange
        ? { teacherId, createdAt: dateRange }
        : { teacherId },
      _sum: { scoreImpact: true },
    });

    const currentScore = clampScore(SCORE_BASELINE + (agg._sum.scoreImpact ?? 0));

    // 2️⃣ Calculate next score
    const nextScore = currentScore + scoreImpact;

    // 3️⃣ Block invalid updates
    if (nextScore > 100 || nextScore < 0) {
      return NextResponse.json(
        { message: "Performance score must stay between 0 and 100" },
        { status: 400 }
      );
    }

    /* ---------- CREATE RECORD ---------- */
    const record = await prisma.teacherAuditRecord.create({
      data: {
        teacherId,
        createdById: session.user.id,
        category,
        customCategory,
        description,
        scoreImpact: Math.trunc(scoreImpact),
        ...(academicYear ? { createdAt: createdAtForAcademicYear(academicYear) } : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ record }, { status: 201 });
    });
  } catch (e: unknown) {
    logger.error("Teacher audit records POST:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
