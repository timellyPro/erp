import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { LeaveType } from "@prisma/client";
import {
  createNotificationsForUserIds,
  getClassStaffNotifyUserIds,
} from "@/lib/notificationService";

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

    const body = await req.json();
    const { leaveType, reason, fromDate, toDate } = body;
    if (!reason || !fromDate || !toDate) {
      return NextResponse.json(
        { message: "reason, fromDate, and toDate are required" },
        { status: 400 }
      );
    }

    const validTypes: LeaveType[] = ["CASUAL", "SICK", "PAID", "UNPAID"];
    const type = validTypes.includes(leaveType) ? leaveType : "CASUAL";

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
      console.warn("Student leave request notification failed:", nErr);
    }

    return NextResponse.json({ leave }, { status: 201 });
  } catch (e: unknown) {
    console.error("Student leave apply:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
