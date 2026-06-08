import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import {
  parentPortalSwrRead,
  parentPortalSwrWrite,
  PARENT_LIST_TTL,
} from "@/lib/parentPortalSwr";

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null; studentId?: string | null };
}): Promise<string | null> {
  let schoolId = session.user.schoolId ?? null;
  if (!schoolId && session.user.studentId) {
    const st = await prisma.student.findUnique({
      where: { id: session.user.studentId },
      select: { schoolId: true },
    });
    schoolId = st?.schoolId ?? null;
  }
  return schoolId;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const studentId = searchParams.get("studentId");
    const subject = searchParams.get("subject");
    const examType = searchParams.get("examType");
    const bypassCache = searchParams.get("refresh") === "1";

    const schoolId = await resolveSchoolId(session);

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {
      class: { schoolId },
    };

    if (session.user.studentId) {
      where.studentId = session.user.studentId;
    } else {
      if (studentId) where.studentId = studentId;
      if (classId) where.classId = classId;
    }

    if (subject) where.subject = subject;
    if (examType) where.examType = examType.toUpperCase();

    if (session.user.studentId && !bypassCache) {
      const sid = session.user.studentId;
      const cacheParams = { studentId: sid, subject, examType };
      const serverKey = `parent:${sid}:marks:${subject ?? "all"}:${examType ?? "all"}`;
      const hit = await parentPortalSwrRead<{ marks: unknown[] }>({
        schoolId,
        namespace: "api",
        resource: "parent:marks:view",
        params: cacheParams,
        serverKey,
        ttl: PARENT_LIST_TTL,
      });
      if (hit.value) {
        return NextResponse.json(hit.value, { status: 200 });
      }
    }

    const marks = await prisma.mark.findMany({
      where,
      include: {
        student: session.user.studentId
          ? undefined
          : {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
        class: { select: { id: true, name: true, section: true } },
        teacher: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: session.user.studentId ? 500 : undefined,
    });

    const payload = { marks };

    if (session.user.studentId && !bypassCache) {
      const sid = session.user.studentId;
      await parentPortalSwrWrite({
        schoolId,
        namespace: "api",
        resource: "parent:marks:view",
        params: { studentId: sid, subject, examType },
        serverKey: `parent:${sid}:marks:${subject ?? "all"}:${examType ?? "all"}`,
        ttl: PARENT_LIST_TTL,
        value: payload,
      });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    console.error("View marks error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
