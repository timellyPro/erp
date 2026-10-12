import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInOptionalTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";

type EndParams =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: EndParams) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const appointmentId = resolved.id;

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isTeacher = session.user.role === "TEACHER";

  try {
    return await runInOptionalTenantScope(session.user.schoolId, async () => {
    if (!appointmentId) {
      return NextResponse.json({ message: "Appointment id missing" }, { status: 400 });
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

    const isOwnerTeacher = appointment.teacherId === session.user.id;

    if (!isTeacher || !isOwnerTeacher) {
      return NextResponse.json(
        { message: "Only the assigned teacher can end the chat" },
        { status: 403 }
      );
    }

    if (session.user.schoolId && appointment.schoolId && appointment.schoolId !== session.user.schoolId) {
      return NextResponse.json(
        { message: "Not allowed to end chats from another school" },
        { status: 403 }
      );
    }

    if (appointment.status !== "APPROVED") {
      return NextResponse.json(
        { message: "Only approved chats can be ended" },
        { status: 400 }
      );
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "ENDED" },
    });

    return NextResponse.json(
      { message: "Chat ended", appointment: updated },
      { status: 200 }
    );
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    logger.error("End chat error:", error);
    return NextResponse.json(
      { message: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
