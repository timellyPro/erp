import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

/** Academic year "2024-2025" -> { start: Sep 1 2024, end: Aug 31 2025 } */
/** Academic year "2024-2025" -> June 1 2024 - April 30 2025 */
function academicYearRange(
  academicYear: string
): { start: Date; end: Date } | null {
  const m = academicYear.match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;

  const startYear = parseInt(m[1], 10);

  const start = new Date(startYear, 5, 1, 0, 0, 0); // June 1
  const end = new Date(startYear + 1, 4, 31, 23, 59, 59); // may 31

  return { start, end };
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
    const hasFeature = session.user.role === "TEACHER" && session.user.allowedFeatures?.includes("TEACHER_AUDIT");
    if (!isAdmin && !hasFeature) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
    }
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const academicYear = searchParams.get("academicYear")?.trim() ?? "";

    const yearRange = academicYear ? academicYearRange(academicYear) : null;

    const teachers = await prisma.user.findMany({
      where: {
        schoolId,
        role: "TEACHER",
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { teacherId: { contains: q, mode: "insensitive" } },
                { subject: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        photoUrl: true,
        teacherId: true,
        subject: true,
      },
      orderBy: { name: "asc" },
      take: 50,
    });

    // Compute performance scores (baseline 50 + sum impacts, clamped 0..100)
    // Optionally filter by academic year
    const scores = await Promise.all(
      teachers.map(async (t) => {
        const where = yearRange
          ? { teacherId: t.id, createdAt: { gte: yearRange.start, lte: yearRange.end } }
          : { teacherId: t.id };
        const agg = await prisma.teacherAuditRecord.aggregate({
          where,
          _sum: { scoreImpact: true },
          _count: { _all: true },
        });
        const impact = agg._sum.scoreImpact ?? 0;
        const score = clampScore(impact);
        return { teacherId: t.id, score, recordCount: agg._count._all };
      })
    );

    const scoreMap = new Map(scores.map((s) => [s.teacherId, s]));

    return NextResponse.json(
      {
        teachers: teachers.map((t) => ({
          ...t,
          performanceScore: scoreMap.get(t.id)?.score ?? 0,
          recordCount: scoreMap.get(t.id)?.recordCount ?? 0,
        })),
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    console.error("Teacher audit teachers GET:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

