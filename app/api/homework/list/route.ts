import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import {
  parentPortalSwrRead,
  parentPortalSwrWrite,
  PARENT_LIST_TTL,
} from "@/lib/parentPortalSwr";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const subject = searchParams.get("subject");
    const bypassCache = searchParams.get("refresh") === "1";

    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const teacherClass = await prisma.class.findFirst({
        where: { teacherId: session.user.id },
        select: { schoolId: true },
      });
      schoolId = teacherClass?.schoolId ?? null;
    }
    if (!schoolId && session.user.studentId) {
      const st = await prisma.student.findUnique({
        where: { id: session.user.studentId },
        select: { schoolId: true },
      });
      schoolId = st?.schoolId ?? null;
    }
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { schoolId };

    if (classId) {
      where.classId = classId;
    }

    if (session.user.studentId) {
      const student = await prisma.student.findUnique({
        where: { id: session.user.studentId },
        select: { classId: true },
      });

      if (student?.classId) {
        where.classId = student.classId;
      }

      const cacheParams = {
        studentId: session.user.studentId,
        subject: subject ?? null,
        classId: where.classId ?? null,
      };
      const serverKey = `parent:${session.user.studentId}:homework:${subject ?? "all"}`;

      if (!bypassCache) {
        const hit = await parentPortalSwrRead<{ homeworks: unknown[] }>({
          schoolId,
          namespace: "api",
          resource: "parent:homework:list",
          params: cacheParams,
          serverKey,
          ttl: PARENT_LIST_TTL,
        });
        if (hit.value) {
          return NextResponse.json(hit.value, { status: 200 });
        }
      }
    }

    if (subject) {
      where.subject = subject;
    }

    const homeworks = await prisma.homework.findMany({
      where,
      include: {
        class: {
          select: {
            id: true,
            name: true,
            section: true,
            _count: { select: { students: true } },
          },
        },
        teacher: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { submissions: true },
        },
        ...(session.user.studentId
          ? {
              submissions: {
                where: { studentId: session.user.studentId },
                take: 1,
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: session.user.studentId ? 100 : undefined,
    });

    if (session.user.studentId) {
      const homeworksWithSubmission = homeworks.map((homework) => {
        const submission =
          "submissions" in homework && Array.isArray(homework.submissions)
            ? homework.submissions[0] ?? null
            : null;
        const { submissions: _subs, ...rest } = homework as typeof homework & {
          submissions?: Array<{ id: string; content?: string | null; fileUrl?: string | null; submittedAt?: Date }>;
        };
        return {
          ...rest,
          hasSubmitted: !!submission,
          submission: submission || null,
        };
      });

      const payload = { homeworks: homeworksWithSubmission };
      const serverKey = `parent:${session.user.studentId}:homework:${subject ?? "all"}`;
      if (!bypassCache) {
        await parentPortalSwrWrite({
          schoolId,
          namespace: "api",
          resource: "parent:homework:list",
          params: {
            studentId: session.user.studentId,
            subject: subject ?? null,
            classId: where.classId ?? null,
          },
          serverKey,
          ttl: PARENT_LIST_TTL,
          value: payload,
        });
      }
      return NextResponse.json(payload, { status: 200 });
    }

    return NextResponse.json({ homeworks }, { status: 200 });
  } catch (error: unknown) {
    console.error("List homeworks error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
