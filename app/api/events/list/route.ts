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
    const teacherId = searchParams.get("teacherId");
    const scope = searchParams.get("scope");
    const bypassCache = searchParams.get("refresh") === "1";

    let schoolId = session.user.schoolId;
    if (!schoolId && session.user.studentId) {
      const student = await prisma.student.findUnique({
        where: { id: session.user.studentId },
        select: { schoolId: true },
      });
      schoolId = student?.schoolId ?? null;
    }
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
      if (!schoolId && session.user.role === "TEACHER") {
        const teacherSchool = await prisma.school.findFirst({
          where: { teachers: { some: { id: session.user.id } } },
          select: { id: true },
        });
        schoolId = teacherSchool?.id ?? null;
      }
    }
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { schoolId };

    if (scope === "teacher" && session.user.role === "TEACHER") {
      where.teacherId = session.user.id;
    } else if (teacherId) {
      where.teacherId = teacherId;
    }
    if (classId) {
      where.classId = classId;
    }

    if (session.user.studentId && !bypassCache) {
      const serverKey = `parent:${session.user.studentId}:events:all`;
      const hit = await parentPortalSwrRead<{ events: unknown[] }>({
        schoolId,
        namespace: "api",
        resource: "parent:events:list",
        params: { studentId: session.user.studentId },
        serverKey,
        ttl: PARENT_LIST_TTL,
      });
      if (hit.value) {
        return NextResponse.json(hit.value, { status: 200 });
      }
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        class: {
          select: { id: true, name: true, section: true },
        },
        teacher: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { registrations: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: session.user.studentId ? 50 : undefined,
    });

    if (session.user.studentId) {
      const studentId = session.user.studentId;
      const eventIds = events.map((e) => e.id);

      const [registrations, workshopCerts] = await Promise.all([
        prisma.eventRegistration.findMany({
          where: { studentId, eventId: { in: eventIds } },
        }),
        prisma.certificate.findMany({
          where: {
            studentId,
            title: { endsWith: " - Participation" },
          },
          select: { title: true },
        }),
      ]);

      const regByEvent = new Map(registrations.map((r) => [r.eventId, r]));
      const eventTitlesWithCert = new Set(
        workshopCerts.map((c) => c.title.replace(/ - Participation$/, ""))
      );

      const eventsWithRegistration = events.map((event) => {
        const registration = regByEvent.get(event.id);
        return {
          ...event,
          isRegistered: !!registration,
          registrationStatus: registration?.paymentStatus || null,
          hasCertificate: eventTitlesWithCert.has(event.title),
        };
      });

      const payload = { events: eventsWithRegistration };
      if (!bypassCache) {
        await parentPortalSwrWrite({
          schoolId,
          namespace: "api",
          resource: "parent:events:list",
          params: { studentId },
          serverKey: `parent:${studentId}:events:all`,
          ttl: PARENT_LIST_TTL,
          value: payload,
        });
      }
      return NextResponse.json(payload, { status: 200 });
    }

    return NextResponse.json({ events }, { status: 200 });
  } catch (error: unknown) {
    console.error("List events error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
