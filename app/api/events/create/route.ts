import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import {
  createNotificationsForUserIds,
  getSchoolUserIds,
} from "@/lib/notificationService";
import { getErrorMessage } from "@/lib/errors/errorInfo";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const createEventBodySchema = z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      type: z.string().optional(),
      level: z.string().optional(),
      location: z.string().optional(),
      mode: z.string().optional(),
      additionalInfo: z.string().optional(),
      photo: z.string().optional().nullable(),
      eventDate: z.string().optional().nullable(),
      classId: z.string().optional().nullable(),
      studentIds: z.array(z.unknown()).optional().nullable(),
      maxSeats: z.union([z.number(), z.string()]).optional().nullable(),
      amount: z.union([z.number(), z.string()]).optional().nullable(),
    });
    const parsedBody = createEventBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: "Title, description, type, level, location, mode and additionalInfo are required" },
        { status: 400 }
      );
    }
    const { title, description, type, level, location, mode, additionalInfo, photo, eventDate, classId, studentIds, maxSeats, amount } = parsedBody.data;

    if (!title || !description || !type || !level || !location || !mode || !additionalInfo) {
      return NextResponse.json(
        { message: "Title, description, type, level, location, mode and additionalInfo are required" },
        { status: 400 }
      );
    }

    const teacherId = session.user.id;
    const schoolId = session.user.schoolId;

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }
    return await runInTenantScope(schoolId, async () => {

    // If classId is provided, verify it belongs to teacher's school
    if (classId) {
      const classData = await prisma.class.findFirst({
        where: {
          id: classId,
          schoolId: schoolId,
        },
      });

      if (!classData) {
        return NextResponse.json(
          { message: "Class not found or doesn't belong to your school" },
          { status: 404 }
        );
      }
    }

    let parsedEventDate: Date | null = null;
    if (eventDate) {
      const parsed = new Date(eventDate);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { message: "Invalid eventDate" },
          { status: 400 }
        );
      }
      parsedEventDate = parsed;
    }

    const eventAmount = typeof amount === "number" && amount >= 0 ? amount : (typeof amount === "string" ? parseFloat(amount) || 0 : 0);

    const event = await prisma.event.create({
      data: {
        title,
        description,
        level,
        type,
        location,
        mode,
        additionalInfo,
        photo: photo || null,
        eventDate: parsedEventDate,
        classId: classId || null,
        teacherId,
        schoolId,
        maxSeats: maxSeats != null && typeof maxSeats === "number" ? maxSeats : null,
        amount: Math.max(0, eventAmount),
      },
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
    });

    // Pre-register selected students
    const ids = Array.isArray(studentIds) ? studentIds.filter((id): id is string => typeof id === "string" && !!id) : [];
    if (ids.length > 0) {
      await prisma.eventRegistration.createMany({
        data: ids.map((studentId) => ({
          eventId: event.id,
          studentId,
          paymentStatus: "PENDING",
        })),
        skipDuplicates: true,
      });
    }

    try {
      const userIds = await getSchoolUserIds(schoolId);
      await createNotificationsForUserIds(
        userIds.filter((id) => id !== teacherId),
        "WORKSHOPS",
        "New workshop/event",
        title.length > 80 ? title.slice(0, 80) + "…" : title
      );
    } catch (nErr) {
      logger.warn("Workshop notification failed:", nErr);
    }

    return NextResponse.json(
      { message: "Event created successfully", event },
      { status: 201 }
    );
    });
  } catch (error: unknown) {
    logger.error("Create event error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
