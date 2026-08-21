import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { activeStudentWhere } from "@/lib/studentStatus";

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null; role: string };
}): Promise<string | null> {
  let schoolId = session.user.schoolId ?? null;
  if (!schoolId) {
    const school = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = school?.id ?? null;
  }
  if (!schoolId && session.user.role === "TEACHER") {
    const teacherClass = await prisma.class.findFirst({
      where: { teacherId: session.user.id },
      select: { schoolId: true },
    });
    schoolId = teacherClass?.schoolId ?? null;
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

function normalizeSubject(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

type MarkVal = {
  subject: string;
  marks: number;
  totalMarks: number;
  grade: string | null;
  examType: string | null;
  createdAt: string;
};

/** Competition ranking: ties share rank; next skips (e.g. 1,1,1,4). */
function assignCompetitionRanks<T extends { totalObtained: number }>(
  rows: T[]
): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.totalObtained !== a.totalObtained) return b.totalObtained - a.totalObtained;
    return 0;
  });
  const out: (T & { rank: number })[] = [];
  let i = 0;
  while (i < sorted.length) {
    const score = sorted[i].totalObtained;
    let j = i;
    while (j < sorted.length && sorted[j].totalObtained === score) j++;
    const competitionRank = i + 1;
    for (let k = i; k < j; k++) {
      out.push({ ...sorted[k], rank: competitionRank });
    }
    i = j;
  }
  return out;
}

/**
 * GET /api/marks/consolidated
 * Query: classIds (comma-separated), examType (optional), subjects (optional comma-separated filter)
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "SCHOOLADMIN" && role !== "SUPERADMIN" && role !== "TEACHER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const classIdsParam = searchParams.get("classIds") || "";
    const examTypeRaw = searchParams.get("examType");
    const examType =
      examTypeRaw && examTypeRaw !== "ALL" ? examTypeRaw.trim().toUpperCase() : null;
    const subjectsFilter = (searchParams.get("subjects") || "")
      .split(",")
      .map((s) => normalizeSubject(s))
      .filter(Boolean);
    // groupBy=class → combine all selected sections that share the same class name
    // groupBy=section → one sheet per class/section (default)
    const groupBy = searchParams.get("groupBy") === "class" ? "class" : "section";

    const classIds = classIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (classIds.length === 0) {
      return NextResponse.json({ message: "classIds is required" }, { status: 400 });
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, address: true },
    });

    const classes = await prisma.class.findMany({
      where: { id: { in: classIds }, schoolId },
      select: { id: true, name: true, section: true },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });

    if (classes.length === 0) {
      return NextResponse.json({ message: "No classes found" }, { status: 404 });
    }

    const allowedClassIds = classes.map((c) => c.id);

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        classId: { in: allowedClassIds },
        ...activeStudentWhere,
      },
      select: {
        id: true,
        rollNo: true,
        admissionNumber: true,
        classId: true,
        user: { select: { name: true } },
      },
      orderBy: { user: { name: "asc" } },
    });

    const marks = await prisma.mark.findMany({
      where: {
        classId: { in: allowedClassIds },
        ...(examType ? { examType } : {}),
      },
      select: {
        id: true,
        studentId: true,
        classId: true,
        subject: true,
        marks: true,
        totalMarks: true,
        grade: true,
        examType: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const latestByStudentSubject = new Map<string, MarkVal>();

    for (const m of marks) {
      const subject = normalizeSubject(m.subject);
      if (subjectsFilter.length && !subjectsFilter.includes(subject)) continue;

      const key = `${m.studentId}::${subject}`;
      const existing = latestByStudentSubject.get(key);
      const createdAt = m.createdAt.toISOString();
      if (!existing || createdAt > existing.createdAt) {
        latestByStudentSubject.set(key, {
          subject,
          marks: m.marks,
          totalMarks: m.totalMarks,
          grade: m.grade,
          examType: m.examType,
          createdAt,
        });
      }
    }

    type ClassRow = { id: string; name: string; section: string | null };
    type SheetGroup = {
      key: string;
      label: string;
      className: string;
      section: string | null;
      classIds: string[];
      classes: ClassRow[];
    };

    const groups: SheetGroup[] = [];
    if (groupBy === "class") {
      const byName = new Map<string, ClassRow[]>();
      for (const cls of classes) {
        const nameKey = cls.name.trim().toUpperCase();
        const list = byName.get(nameKey) ?? [];
        list.push(cls);
        byName.set(nameKey, list);
      }
      for (const [, list] of byName) {
        const className = list[0].name;
        groups.push({
          key: className,
          label: className,
          className,
          section: null,
          classIds: list.map((c) => c.id),
          classes: list,
        });
      }
    } else {
      for (const cls of classes) {
        const label = cls.section ? `${cls.name}-${cls.section}` : cls.name;
        groups.push({
          key: cls.id,
          label,
          className: cls.name,
          section: cls.section,
          classIds: [cls.id],
          classes: [cls],
        });
      }
    }

    const classById = new Map(classes.map((c) => [c.id, c]));

    const sheets = groups.map((group) => {
      const classStudents = students.filter((s) =>
        s.classId ? group.classIds.includes(s.classId) : false
      );
      const includeSectionCol = groupBy === "class" && group.classes.length > 1;

      const subjectSet = new Set<string>();
      for (const s of classStudents) {
        for (const [key, val] of latestByStudentSubject.entries()) {
          if (key.startsWith(`${s.id}::`)) subjectSet.add(val.subject);
        }
      }

      const subjects = subjectsFilter.length
        ? subjectsFilter.filter((s) => subjectSet.has(s))
        : Array.from(subjectSet).sort((a, b) => a.localeCompare(b));

      type Row = {
        id: string;
        name: string;
        rollNo: string | null;
        admissionNumber: string | null;
        section: string | null;
        subjectMarks: Record<string, number | "AB" | null>;
        totalObtained: number;
        totalMax: number;
        percentage: number;
        grade: string;
      };

      const rows: Row[] = classStudents.map((s) => {
        const subjectMarks: Record<string, number | "AB" | null> = {};
        let totalObtained = 0;
        let totalMax = 0;
        const cls = s.classId ? classById.get(s.classId) : undefined;

        for (const subject of subjects) {
          const val = latestByStudentSubject.get(`${s.id}::${subject}`);
          if (!val) {
            subjectMarks[subject] = null;
            continue;
          }
          if (val.grade === "AB") {
            subjectMarks[subject] = "AB";
            totalMax += val.totalMarks;
          } else {
            subjectMarks[subject] = val.marks;
            totalObtained += val.marks;
            totalMax += val.totalMarks;
          }
        }

        const percentage =
          totalMax > 0 ? Math.round((totalObtained / totalMax) * 1000) / 10 : 0;

        return {
          id: s.id,
          name: s.user?.name ?? "Student",
          rollNo: s.rollNo,
          admissionNumber: s.admissionNumber,
          section: cls?.section ?? null,
          subjectMarks,
          totalObtained,
          totalMax,
          percentage,
          grade: totalMax > 0 ? getGrade(percentage) : "—",
        };
      });

      const ranked = assignCompetitionRanks(rows);

      return {
        classId: group.classIds[0],
        classIds: group.classIds,
        className: group.className,
        section: group.section,
        label: group.label,
        includeSectionCol,
        subjects,
        students: ranked,
      };
    });

    return NextResponse.json(
      {
        school: {
          name: school?.name ?? "School",
          address: school?.address ?? "",
        },
        examType: examType ?? "ALL",
        groupBy,
        sheets,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Consolidated marks error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
