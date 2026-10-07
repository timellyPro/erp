import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notificationService";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const role = session.user.role;
    if (role !== "TEACHER" && role !== "SCHOOLADMIN") {
      return NextResponse.json({ message: "Only teachers or school admin can approve" }, { status: 403 });
    }

    const { id } = await params;
    const leave = await prisma.studentLeaveRequest.update({
      where: { id, status: "PENDING" },
      data: { status: "APPROVED", approverId: session.user.id },
      include: { student: { select: { userId: true } } },
    });

    if (leave.student?.userId) {
      createNotification(
        leave.student.userId,
        "LEAVE",
        "Student leave approved",
        "Your student leave request has been approved"
      ).catch(() => {});
    }

    return NextResponse.json({ leave }, { status: 200 });
  } catch (e: unknown) {
    console.error("Student leave approve:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
