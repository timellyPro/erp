import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notificationService";
import { isActiveStudent } from "@/lib/studentStatus";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { classId, date, period, attendances } = await req.json();

    if (!classId || !date || !period || !attendances || !Array.isArray(attendances)) {
      return NextResponse.json(
        { message: "Missing required fields: classId, date, period, and attendances array" },
        { status: 400 }
      );
    }

    if (period < 1 || period > 8) {
      return NextResponse.json(
        { message: "Period must be between 1 and 8" },
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

    // Verify class belongs to teacher's school
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

    // Allow teachers to mark attendance for any class in their school
    // (Removed strict assignment check for flexibility)

    const dateOnly = (() => {
      if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [y, m, d] = date.split("-").map(Number);
        return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
      }
      const parsed = new Date(date);
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    })();

    // Create or update attendance records
    const results = await Promise.all(
      attendances.map(async (att: { studentId: string; status: string }) => {
        if (!att.studentId || !att.status) {
          throw new Error("Each attendance must have studentId and status");
        }

        if (!["PRESENT", "ABSENT", "LATE"].includes(att.status)) {
          throw new Error("Status must be PRESENT, ABSENT, or LATE");
        }

        // Verify student belongs to the class
        const student = await prisma.student.findFirst({
          where: {
            id: att.studentId,
            classId: classId,
            schoolId: schoolId,
          },
        });

        if (!student) {
          throw new Error(`Student ${att.studentId} not found in this class`);
        }

        if (!isActiveStudent(student.status)) {
          throw new Error(`Student ${att.studentId} is inactive and cannot be marked for attendance`);
        }

        // Upsert attendance
        const result = await prisma.attendance.upsert({
          where: {
            studentId_classId_date_period: {
              studentId: att.studentId,
              classId: classId,
              date: dateOnly,
              period: period,
            },
          },
          update: {
            status: att.status,
            teacherId: teacherId,
          },
          create: {
            studentId: att.studentId,
            classId: classId,
            date: dateOnly,
            period: period,
            status: att.status,
            teacherId: teacherId,
          },
        });

        if (student.userId) {
          const dateStr = dateOnly.toLocaleDateString();
          await createNotification(
            student.userId,
            "ATTENDANCE",
            "Attendance Updated",
            `Your attendance for period ${period} on ${dateStr} has been marked: ${att.status}`
          );
        }

        return result;
      })
    );

    return NextResponse.json(
      { message: "Attendance marked successfully", attendances: results },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Mark attendance error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
