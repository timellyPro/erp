import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { hashStudentPasswordFromDob } from "@/lib/students/studentDefaultPassword";
import { invalidateTenant } from "@/lib/cache/tenantCache";
import { logger } from "@/lib/logger";
import { schoolIdViaAdminRelation } from "@/lib/auth/tenant";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

const MAX_RESET = 5000;

const resetCredentialsBodySchema = z.object({
  classId: z.string().optional(),
  className: z.string().optional(),
  section: z.string().optional(),
});

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null };
}): Promise<string | null> {
  return session.user.schoolId ?? (await schoolIdViaAdminRelation(session.user.id));
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
    return await runInTenantScope(schoolId, async (schoolId) => {

    if (session.user.schoolIsActive === false) {
      return NextResponse.json({ message: "School is paused" }, { status: 403 });
    }

    const parsedBody = resetCredentialsBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;

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
    });
  } catch (error: unknown) {
    logger.error("Student credentials reset error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
