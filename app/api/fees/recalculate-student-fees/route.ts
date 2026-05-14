import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";
import { upsertStudentFeeFromStructure } from "@/lib/studentTuitionFromStructure";

/**
 * Recompute StudentFee.totalFee / finalFee / remainingFee from class structure + extra fees for every
 * student in the school. Preserves discount % and amount paid. Use after fixing duplicate hostel/mess extras.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const students = await prisma.student.findMany({
      where: { schoolId },
      select: {
        id: true,
        classId: true,
        class: { select: { section: true } },
        fee: { select: { discountPercent: true, amountPaid: true } },
      },
    });

    const chunkSize = 12;
    for (let i = 0; i < students.length; i += chunkSize) {
      const chunk = students.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map((s) =>
          upsertStudentFeeFromStructure(prisma, {
            schoolId,
            studentId: s.id,
            classId: s.classId,
            section: s.class?.section ?? null,
            discountPercent: s.fee?.discountPercent ?? 0,
            amountPaid: s.fee?.amountPaid ?? 0,
          })
        )
      );
    }

    return NextResponse.json({ ok: true, updatedStudents: students.length }, { status: 200 });
  } catch (error: unknown) {
    console.error("Recalculate student fees error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
