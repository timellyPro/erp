import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInOptionalTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

// GET messages for an appointment
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const appointmentId = searchParams.get("appointmentId");

  if (!appointmentId) {
    return NextResponse.json(
      { message: "appointmentId is required" },
      { status: 400 }
    );
  }

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      return NextResponse.json(
        { message: "Appointment not found" },
        { status: 404 }
      );
    }

    const userId = session.user.id;

    if (
      appointment.studentId !== session.user.studentId &&
      appointment.teacherId !== userId
    ) {
      return NextResponse.json(
        { message: "You are not part of this appointment" },
        { status: 403 }
      );
    }
    const messages = await prisma.chatMessage.findMany({
      where: { appointmentId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ messages });
  } catch (error: unknown) {
    logger.error("List messages error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST create message
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    return await runInOptionalTenantScope(session.user.schoolId, async () => {
    const createMessageBodySchema = z.object({
      appointmentId: z.string().optional(),
      content: z.string().optional(),
    });
    const parsedBody = createMessageBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: "appointmentId and content are required" },
        { status: 400 }
      );
    }
    const { appointmentId, content } = parsedBody.data;

    if (!appointmentId || !content) {
      return NextResponse.json(
        { message: "appointmentId and content are required" },
        { status: 400 }
      );
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      return NextResponse.json(
        { message: "Appointment not found" },
        { status: 404 }
      );
    }

    const userId = session.user.id;
    if (
      appointment.studentId !== session.user.studentId &&
      appointment.teacherId !== userId
    ) {
      return NextResponse.json(
        { message: "You are not part of this appointment" },
        { status: 403 }
      );
    }

    if (appointment.status !== "APPROVED") {
      return NextResponse.json(
        {
          message:
            appointment.status === "ENDED"
              ? "This chat has been ended by the teacher"
              : "Chat is only available for approved appointments",
        },
        { status: 400 }
      );
    }

    const message = await prisma.chatMessage.create({
      data: {
        appointmentId,
        senderId: userId,
        content,
      },
    });

    return NextResponse.json(message, { status: 201 });
    });
  } catch (error: unknown) {
    logger.error("Create message error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}

