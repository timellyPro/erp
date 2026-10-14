import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    let schoolId = session.user.schoolId;
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
    return await runInTenantScope(schoolId, async (schoolId) => {

    const updateEventBodySchema = z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      type: z.string().optional(),
      level: z.string().optional(),
      location: z.string().optional(),
      mode: z.string().optional(),
      additionalInfo: z.string().optional(),
      photo: z.string().optional().nullable(),
      eventDate: z.string().optional().nullable(),
      maxSeats: z.union([z.number(), z.string()]).optional().nullable(),
      amount: z.union([z.number(), z.string()]).optional().nullable(),
    });
    const parsedBody = updateEventBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          message:
            "Title, description, type, level, location, mode and additionalInfo are required",
        },
        { status: 400 }
      );
    }
    const {
      title,
      description,
      type,
      level,
      location,
      mode,
      additionalInfo,
      photo,
      eventDate,
      maxSeats,
      amount,
    } = parsedBody.data;

    if (
      !title ||
      !description ||
      !type ||
      !level ||
      !location ||
      !mode ||
      !additionalInfo
    ) {
      return NextResponse.json(
        {
          message:
            "Title, description, type, level, location, mode and additionalInfo are required",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.event.findFirst({
      where: { id, schoolId },
    });

    if (!existing) {
      return NextResponse.json({ message: "Event not found" }, { status: 404 });
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

    const updated = await prisma.event.update({
      where: { id },
      data: {
        title,
        description,
        type,
        level,
        location,
        mode,
        additionalInfo,
        eventDate: parsedEventDate,
        photo: photo ?? null,
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

    return NextResponse.json(
      { message: "Event updated successfully", event: updated },
      { status: 200 }
    );
    });
  } catch (error: unknown) {
    logger.error("Update event error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    let schoolId = session.user.schoolId;
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
    return await runInTenantScope(schoolId, async (schoolId) => {

    const existing = await prisma.event.findFirst({
      where: { id, schoolId },
    });

    if (!existing) {
      return NextResponse.json({ message: "Event not found" }, { status: 404 });
    }

    await prisma.event.delete({ where: { id } });

    return NextResponse.json(
      { message: "Event deleted successfully" },
      { status: 200 }
    );
    });
  } catch (error: unknown) {
    logger.error("Delete event error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
