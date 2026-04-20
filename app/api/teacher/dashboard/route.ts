import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const schoolId = session.user.schoolId;
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const [classes, circulars, notifications, unreadCount, appointments] =
      await Promise.all([
        prisma.class.findMany({
          where: { teacherId: userId },
          include: { _count: { select: { students: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.circular.findMany({
          where: { schoolId },
          include: { issuedBy: { select: { name: true, photoUrl: true } } },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
        prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        prisma.notification.count({
          where: { userId, isRead: false },
        }),
        prisma.appointment.findMany({
          where: { teacherId: userId },
          include: {
            student: {
              select: {
                fatherName: true,
                user: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 4,
        }),
      ]);

    let events: Array<{ id: string; title: string; eventDate: Date | null }> = [];
    try {
      events = await prisma.event.findMany({
        where: { schoolId },
        select: { id: true, title: true, eventDate: true },
        orderBy: { eventDate: "asc" },
        take: 4,
      });
    } catch (err) {
      console.warn("Teacher dashboard events fallback:", err);
      events = [];
    }

    const totalClasses = classes.length;
    const totalStudents = classes.reduce(
      (sum, cls) => sum + (cls._count?.students ?? 0),
      0
    );

    const pendingChats = appointments.filter(
      (appt) => appt.status === "PENDING"
    ).length;

    return NextResponse.json(
      {
        profile: {
          name: session.user.name ?? "Teacher",
        },
        stats: {
          totalClasses,
          totalStudents,
          pendingChats,
          unreadAlerts: unreadCount ?? 0,
        },
        circulars: circulars.map((c) => ({
          id: c.id,
          referenceNumber: c.referenceNumber ?? "",
          subject: c.subject ?? "",
          content: c.content ?? "",
          publishStatus: c.publishStatus ?? "DRAFT",
          date: c.date.toISOString(),
          issuedBy: c.issuedBy?.name ?? "School Admin",
          issuedByPhoto: c.issuedBy?.photoUrl ?? null,
          attachments: c.attachments ?? [],
        })),
        notifications: notifications.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          createdAt: n.createdAt.toISOString(),
        })),
        events: events.map((e) => ({
          id: e.id,
          title: e.title ?? "",
          type: "EVENT",
          eventDate: e.eventDate?.toISOString?.() ?? (e.eventDate ? String(e.eventDate) : null),
        })),
        recentChats: appointments.map((appt) => ({
          id: appt.id,
          parentName: appt.student?.fatherName ?? "Parent",
          studentName: appt.student?.user?.name ?? "Student",
          status: appt.status,
          note: appt.note ?? "",
          createdAt: appt.createdAt.toISOString(),
        })),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Teacher dashboard error:", error);
    
    // Handle database connection errors
    const err = error as { code?: string; message?: string; name?: string };
    if (err?.code === "P1001" || err?.message?.includes("Can't reach database server") || err?.name === "PrismaClientInitializationError") {
      return NextResponse.json(
        { message: "Database connection failed. Please check your database configuration." },
        { status: 503 }
      );
    }
    
    if (err?.message?.includes("statement timeout") || err?.message?.includes("Connection terminated")) {
      return NextResponse.json(
        { message: "Database request timed out. Please try again." },
        { status: 408 }
      );
    }
    
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
