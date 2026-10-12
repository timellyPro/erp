import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { LeaveType } from "@prisma/client";
import {
  createNotificationsForUserIds,
  getClassStaffNotifyUserIds,
} from "@/lib/notificationService";
import { invalidateParentPortalCaches } from "@/lib/parent/invalidateParentPortalCaches";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    if (session.user.role !== "STUDENT" && !session.user.studentId) {
      return NextResponse.json({ message: "Only students can apply for leave" }, { status: 403 });
    }

    const studentId = session.user.studentId
      ? session.user.studentId
      : (
          await prisma.student.findFirst({
            where: { userId: session.user.id },
            select: { id: true },
          })
        )?.id;

    if (!studentId) return NextResponse.json({ message: "Student record not found" }, { status: 400 });

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });
    if (!student?.schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });
    return await runInTenantScope(student.schoolId, async () => {

    const applyStudentLeaveBodySchema = z.object({
      leaveType: z.string().optional(),
      reason: z.string().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    });
    const parsedBody = applyStudentLeaveBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: "reason, fromDate, and toDate are required" },
        { status: 400 }
      );
    }
    const { leaveType, reason, fromDate, toDate } = parsedBody.data;
    if (!reason || !fromDate || !toDate) {
      return NextResponse.json(
        { message: "reason, fromDate, and toDate are required" },
        { status: 400 }
      );
    }

    const validTypes: LeaveType[] = ["CASUAL", "SICK", "PAID", "UNPAID"];
    const type: LeaveType = validTypes.includes(leaveType as LeaveType) ? (leaveType as LeaveType) : "CASUAL";

    const leave = await prisma.studentLeaveRequest.create({
      data: {
        studentId,
        schoolId: student.schoolId,
        leaveType: type,
        reason,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
      },
    });

    try {
      const st = await prisma.student.findUnique({
        where: { id: studentId },
        select: {
          schoolId: true,
          classId: true,
          user: { select: { name: true } },
        },
      });
      let classTeacherId: string | null = null;
      if (st?.classId) {
        const cls = await prisma.class.findUnique({
          where: { id: st.classId },
          select: { teacherId: true },
        });
        classTeacherId = cls?.teacherId ?? null;
      }
      const notifyIds = await getClassStaffNotifyUserIds(st?.schoolId ?? student.schoolId, classTeacherId);
      if (notifyIds.length > 0) {
        const studentLabel = st?.user?.name?.trim() || "A student";
        await createNotificationsForUserIds(
          notifyIds,
          "LEAVE",
          "New student leave request",
          `${studentLabel} submitted a leave request pending your review`
        );
      }
    } catch (nErr) {
      logger.warn("Student leave request notification failed:", nErr);
    }

    invalidateParentPortalCaches({ schoolId: student.schoolId, studentId });

    return NextResponse.json({ leave }, { status: 201 });
    });
  } catch (e: unknown) {
    logger.error("Student leave apply:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
