import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notificationService";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const role = session.user.role;
    if (role !== "TEACHER" && role !== "SCHOOLADMIN") {
      return NextResponse.json({ message: "Only teachers or school admin can reject" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const remarks = typeof body.remarks === "string" ? body.remarks : null;

    const leave = await prisma.studentLeaveRequest.update({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", approverId: session.user.id, remarks },
      include: { student: { select: { userId: true } } },
    });

    if (leave.student?.userId) {
      createNotification(
        leave.student.userId,
        "LEAVE",
        "Student leave rejected",
        remarks
          ? `Your student leave request was rejected: ${remarks}`
          : "Your student leave request was rejected"
      ).catch(() => {});
    }

    return NextResponse.json({ leave }, { status: 200 });
  } catch (e: unknown) {
    console.error("Student leave reject:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
