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
    const date = searchParams.get("date");
    const studentId = searchParams.get("studentId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
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

    const toUtcDateOnly = (value: string) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split("-").map(Number);
        return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
      }
      const parsed = new Date(value);
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    };

    if (date) {
      where.date = toUtcDateOnly(date);
    }

    if (startDate && endDate) {
      where.date = {
        gte: toUtcDateOnly(startDate),
        lte: toUtcDateOnly(endDate),
      };
    }

    if (session.user.studentId && startDate && endDate && !bypassCache) {
      const sid = session.user.studentId;
      const cacheParams = { studentId: sid, startDate, endDate };
      const serverKey = `parent:${sid}:attendance:${startDate}:${endDate}`;
      const hit = await parentPortalSwrRead<{ attendances: unknown[] }>({
        schoolId,
        namespace: "api",
        resource: "parent:attendance:view",
        params: cacheParams,
        serverKey,
        ttl: PARENT_LIST_TTL,
      });
      if (hit.value) {
        return NextResponse.json(hit.value, { status: 200 });
      }
    }

    const attendances = await prisma.attendance.findMany({
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
      orderBy: [{ date: "desc" }, { period: "asc" }],
    });

    const payload = { attendances };

    if (session.user.studentId && startDate && endDate && !bypassCache) {
      const sid = session.user.studentId;
      await parentPortalSwrWrite({
        schoolId,
        namespace: "api",
        resource: "parent:attendance:view",
        params: { studentId: sid, startDate, endDate },
        serverKey: `parent:${sid}:attendance:${startDate}:${endDate}`,
        ttl: PARENT_LIST_TTL,
        value: payload,
      });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    console.error("View attendance error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
