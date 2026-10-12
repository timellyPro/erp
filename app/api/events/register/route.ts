import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";
import { getErrorCode, getErrorMessage } from "@/lib/errors/errorInfo";
import { rateLimit, rateLimitKey } from "@/lib/rateLimit";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const registerLimit = await rateLimit(
      rateLimitKey("event-register", session.user.id),
      20,
      10 * 60
    );
    if (!registerLimit.allowed) {
      return NextResponse.json(
        { message: `Too many requests. Please try again in ${Math.ceil(registerLimit.resetInSeconds / 60)} minute(s).` },
        { status: 429 }
      );
    }

    const parsedBody = z.object({ eventId: z.string().optional() }).safeParse(await req.json().catch(() => null));
    const eventId = parsedBody.success ? parsedBody.data.eventId : undefined;

    if (!eventId) {
      return NextResponse.json(
        { message: "Event ID is required" },
        { status: 400 }
      );
    }

    if (!session.user.studentId) {
      return NextResponse.json(
        { message: "Student record not found" },
        { status: 400 }
      );
    }

    const studentId = session.user.studentId;
    const schoolId = session.user.schoolId;

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    // Verify event exists and belongs to student's school
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        schoolId: schoolId,
      },
      include: {
        _count: { select: { registrations: true } },
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "Event not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    // Check max seats if set
    if (event.maxSeats != null && event.maxSeats > 0) {
      const enrolled = event._count?.registrations ?? 0;
      if (enrolled >= event.maxSeats) {
        return NextResponse.json(
          { message: "This workshop is full. No seats available." },
          { status: 400 }
        );
      }
    }

    // Verify student can register (event must be for their class or school-wide)
    if (event.classId) {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { classId: true },
      });

      if (student?.classId !== event.classId) {
        return NextResponse.json(
          { message: "This event is not available for your class" },
          { status: 403 }
        );
      }
    }

    // Check if already registered
    const existingRegistration = await prisma.eventRegistration.findUnique({
      where: {
        eventId_studentId: {
          eventId: eventId,
          studentId: studentId,
        },
      },
    });

    if (existingRegistration) {
      return NextResponse.json(
        { message: "You are already registered for this event", registration: existingRegistration },
        { status: 400 }
      );
    }

    // Create registration
    const registration = await prisma.eventRegistration.create({
      data: {
        eventId: eventId,
        studentId: studentId,
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            description: true,
            level: true,
            type: true,
            location: true,
            mode: true,
            additionalInfo: true,
            photo: true,
            eventDate: true,
          },
        },
        student: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: "Successfully registered for the event",
        registration,
        paymentRequired: event.amount > 0,
        amount: event.amount,
      },
      { status: 201 }
    );
    });
  } catch (error: unknown) {
    logger.error("Register event error:", error);

    if (getErrorCode(error) === "P2002") {
      return NextResponse.json(
        { message: "You are already registered for this event" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
