import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { ExamTermStatus } from "@prisma/client";

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null; role: string };
}) {
  let schoolId = session.user.schoolId;

  if (!schoolId) {
    if (session.user.role === "TEACHER") {
      const teacherClass = await prisma.class.findFirst({
        where: { teacherId: session.user.id },
        select: { schoolId: true },
      });
      schoolId = teacherClass?.schoolId ?? null;

      if (!schoolId) {
        const teacherSchool = await prisma.school.findFirst({
          where: { teachers: { some: { id: session.user.id } } },
          select: { id: true },
        });
        schoolId = teacherSchool?.id ?? null;
      }
    }

    if (!schoolId) {
      const school = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = school?.id ?? null;
    }
  }

  return schoolId;
}

function formatExamDate(d: Date): string {
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    return h === 1 ? "1 Hour" : `${h} Hours`;
  }
  return `${minutes} Mins`;
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

    /* ======================================================
       TEACHER – OLD LOGIC (UNCHANGED)
    ====================================================== */
    if (role === "TEACHER") {
      const terms = await prisma.examTerm.findMany({
        where: {
          schoolId,
          ...(classIdParam ? { classId: classIdParam } : {}),
          ...(status ? { status: status as ExamTermStatus } : {}),
        },
        include: {
          class: { select: { id: true, name: true, section: true } },
          schedules: { orderBy: { examDate: "asc" } },
          syllabus: { orderBy: { subject: "asc" }, include: { units: { orderBy: { order: "asc" } } } },
        },
        orderBy: { createdAt: "desc" },
      });

      const exams: any[] = [];

      for (const term of terms) {
        const classInfo = term.class
          ? { id: term.class.id, name: term.class.name, section: term.class.section ?? "" }
          : { id: "", name: "", section: "" };

        for (const s of term.schedules) {
          const tracking = term.syllabus.find((sy: { subject: any; }) => sy.subject === s.subject);
          const syllabus = tracking
            ? tracking.units.length > 0
              ? tracking.units.map((u: { completedPercent: any; }) => ({ completedPercent: u.completedPercent }))
              : [{ completedPercent: tracking.completedPercent }]
            : [];

          exams.push({
            id: s.id,
            termId: term.id,
            name: term.name,
            status: term.status,
            subject: s.subject,
            class: classInfo,
            date: formatExamDate(s.examDate),
            time: s.startTime,
            duration: formatDuration(s.durationMin),
            syllabus,
          });
        }
      }

      return NextResponse.json({ exams }, { status: 200 });
    }

    /* ======================================================
       STUDENT
    ====================================================== */
    if (role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { userId: session.user.id },
        select: { classId: true },
      });

      if (!student?.classId) {
        return NextResponse.json({ message: "Student class not assigned" }, { status: 400 });
      }

      const terms = await prisma.examTerm.findMany({
        where: {
          schoolId,
          classId: student.classId,
          ...(status ? { status: status as ExamTermStatus } : {}),
        },
        include: {
          class: { include: { teacher: { select: { name: true } } } },
          schedules: { orderBy: { examDate: "asc" } },
          syllabus: { orderBy: { subject: "asc" }, include: { units: { orderBy: { order: "asc" } } } },
          sections: { orderBy: { order: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ terms }, { status: 200 });
    }

    /* ======================================================
       SCHOOL ADMIN – UPDATED
    ====================================================== */
    if (role === "SCHOOLADMIN") {
      const classes = await prisma.class.findMany({
        where: { schoolId },
        select: { id: true, name: true, section: true },
        orderBy: { name: "asc" },
      });

      const terms = await prisma.examTerm.findMany({
        where: {
          schoolId,
          ...(classIdParam ? { classId: classIdParam } : {}),
          ...(status ? { status: status as ExamTermStatus } : {}),
        },
        include: {
          class: { include: { teacher: { select: { name: true } } } },
          schedules: { orderBy: { examDate: "asc" } },
          syllabus: { orderBy: { subject: "asc" }, include: { units: { orderBy: { order: "asc" } } } },
          sections: { orderBy: { order: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ terms, classes }, { status: 200 });
    }

  } catch (e: unknown) {
    console.error("Exams terms GET:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
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

    const body = await req.json();
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

    const term = await prisma.examTerm.create({
      data: { name, description, classId, status, schoolId },
      include: {
        class: { select: { id: true, name: true, section: true } },
      },
    });

    return NextResponse.json({ term }, { status: 201 });
  } catch (e: unknown) {
    console.error("Exams terms POST:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
