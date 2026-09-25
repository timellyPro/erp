import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { hashStudentPasswordFromDob } from "@/lib/studentDefaultPassword";
import { invalidateTenant } from "@/lib/tenantCache";

const MAX_RESET = 5000;

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null };
}): Promise<string | null> {
  let schoolId = session.user.schoolId ?? null;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  return schoolId;
}

function buildWhere(
  schoolId: string,
  classId: string,
  className: string,
  section: string
): Prisma.StudentWhereInput {
  const where: Prisma.StudentWhereInput = { schoolId, status: "Active" };

  if (classId) {
    where.classId = classId;
  } else if (className) {
    where.class = {
      schoolId,
      name: className,
      ...(section ? { section } : {}),
    };
  } else if (section) {
    where.class = { schoolId, section };
  }

  return where;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const isAdmin =
      session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
    if (!isAdmin) {
      return NextResponse.json(
        { message: "Only admins can reset student credentials" },
        { status: 403 }
      );
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    if (session.user.schoolIsActive === false) {
      return NextResponse.json({ message: "School is paused" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      classId?: string;
      className?: string;
      section?: string;
    };

    const classId = body.classId?.trim() || "";
    const className = body.className?.trim() || "";
    const section = body.section?.trim() || "";

    if (classId) {
      const classData = await prisma.class.findFirst({
        where: { id: classId, schoolId },
        select: { id: true },
      });
      if (!classData) {
        return NextResponse.json(
          { message: "Class not found or doesn't belong to your school" },
          { status: 404 }
        );
      }
    }

    const where = buildWhere(schoolId, classId, className, section);

    const students = await prisma.student.findMany({
      where,
      take: MAX_RESET,
      select: {
        id: true,
        dob: true,
        userId: true,
      },
    });

    let resetCount = 0;
    for (const student of students) {
      try {
        const hashed = await hashStudentPasswordFromDob(student.dob);
        await prisma.user.update({
          where: { id: student.userId },
          data: { password: hashed },
        });
        resetCount++;
      } catch {
        /* skip invalid DOB */
      }
    }

    await invalidateTenant(schoolId);

    return NextResponse.json(
      {
        message: `Reset ${resetCount} student password${resetCount === 1 ? "" : "s"} to DOB (YYYYMMDD).`,
        resetCount,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Student credentials reset error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
