import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { createNotification } from "@/lib/notificationService";
import { requireSchoolId } from "@/lib/auth/tenant";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

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

    const ctx = await requireSchoolId(session);
    if (!ctx.ok) {
      return NextResponse.json({ message: ctx.message }, { status: ctx.status });
    }

    return await runInTenantScope(ctx.schoolId, async (_schoolId) => {
    const { id } = await params;
    const existing = await prisma.studentLeaveRequest.findFirst({
      where: { id, status: "PENDING", schoolId: ctx.schoolId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { message: "Leave request not found in your school" },
        { status: 404 }
      );
    }

    const leave = await prisma.studentLeaveRequest.update({
      where: { id: existing.id },
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
    });
  } catch (e: unknown) {
    logger.error("Student leave approve:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
