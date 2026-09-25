import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null };
}): Promise<string | null> {
  let schoolId = session.user.schoolId ?? null;
  if (!schoolId) {
    const admin = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = admin?.id ?? null;
  }
  if (!schoolId) {
    const teacher = await prisma.class.findFirst({
      where: { teacherId: session.user.id },
      select: { schoolId: true },
    });
    schoolId = teacher?.schoolId ?? null;
  }
  return schoolId;
}

function getGrade(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 35) return "D";
  return "F";
}

/**
 * GET /api/marks/report-card
 * Fetches all marks for a student (optionally filtered by examType) to build a report card.
 * Query params: studentId (required), classId, examType
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const classId = searchParams.get("classId");
    const examType = searchParams.get("examType");

    if (!studentId) {
      return NextResponse.json({ message: "studentId is required" }, { status: 400 });
    }

    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      include: {
        user: { select: { name: true } },
        class: { select: { name: true, section: true } },
        school: {
          select: {
            name: true,
            address: true,
            logoUrl: true,
            admins: { select: { photoUrl: true }, take: 1 },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    const where: Record<string, unknown> = {
      studentId,
      class: { schoolId },
    };
    if (classId) where.classId = classId;
    if (examType && examType !== "ALL") where.examType = examType.toUpperCase();

    const marks = await prisma.mark.findMany({
      where,
      orderBy: [{ subject: "asc" }, { createdAt: "desc" }],
    });

    const subjectBest = new Map<string, (typeof marks)[0]>();
    for (const m of marks) {
      const key = `${m.subject}::${m.examType ?? ""}`;
      const existing = subjectBest.get(key);
      if (!existing || new Date(m.createdAt) > new Date(existing.createdAt)) {
        subjectBest.set(key, m);
      }
    }

    const dedupedMarks = Array.from(subjectBest.values());

    let totalObtained = 0;
    let totalMax = 0;

    const markRows = dedupedMarks.map((m) => {
      const pct = m.totalMarks > 0 ? (m.marks / m.totalMarks) * 100 : 0;
      totalObtained += m.marks;
      totalMax += m.totalMarks;
      return {
        subject: m.subject,
        marks: m.marks,
        totalMarks: m.totalMarks,
        percentage: Math.round(pct * 10) / 10,
        grade: m.grade || getGrade(pct),
        examType: m.examType,
      };
    });

    const overallPct = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;

    const className = student.class
      ? student.class.section
        ? `${student.class.name}-${student.class.section}`
        : student.class.name
      : "N/A";

    return NextResponse.json({
      student: {
        name: student.user?.name ?? "Student",
        class: className,
        admissionNumber: student.admissionNumber,
        rollNo: student.rollNo,
        fatherName: student.fatherName,
      },
      school: {
        name: student.school?.name ?? "School",
        address: (student.school as { address?: string })?.address ?? "",
        logoUrl:
          (student.school as { logoUrl?: string | null; admins?: Array<{ photoUrl?: string | null }> })
            ?.logoUrl ||
          (student.school as { admins?: Array<{ photoUrl?: string | null }> })?.admins?.[0]?.photoUrl ||
          null,
      },
      marks: markRows,
      summary: {
        totalObtained,
        totalMax,
        overallPercentage: Math.round(overallPct * 10) / 10,
        overallGrade: getGrade(overallPct),
        totalSubjects: markRows.length,
      },
    });
  } catch (error: unknown) {
    console.error("Report card error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
