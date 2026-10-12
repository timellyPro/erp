import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/**
 * Permanently delete a school and tenant data: students (fees, payments, etc.),
 * classes, then user accounts that only belonged to this school (admins, teachers, students).
 * Body: { "schoolName": "<exact name>" } (must match the school's name, trimmed).
 * DELETE /api/superadmin/schools/[id]
 *
 * Uses sequential `$transaction([...])` (not an interactive callback) so it works with
 * Supabase/PgBouncer transaction pooler (port 6543). Interactive transactions often fail with P2028.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id: schoolId } = await params;

    const deleteSchoolBodySchema = z.object({ schoolName: z.string().optional() });
    const parsedBody = deleteSchoolBodySchema.safeParse(await req.json().catch(() => ({})));
    const body = parsedBody.success ? parsedBody.data : {};
    const confirmName = typeof body.schoolName === "string" ? body.schoolName.trim() : "";

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        admins: { select: { id: true } },
        teachers: { select: { id: true } },
        students: { select: { userId: true } },
      },
    });

    if (!school) {
      return NextResponse.json({ message: "School not found" }, { status: 404 });
    }

    if (confirmName !== school.name.trim()) {
      return NextResponse.json(
        { message: "Type the school name exactly as shown to confirm deletion." },
        { status: 400 }
      );
    }

    const studentUserIds = school.students.map((s) => s.userId);
    const adminIds = school.admins.map((a) => a.id);
    const teacherIds = school.teachers.map((t) => t.id);
    const candidateUserIds = [...new Set([...studentUserIds, ...adminIds, ...teacherIds])];

    let userIdsToDelete: string[] = [];
    if (candidateUserIds.length > 0) {
      const users = await prisma.user.findMany({
        where: {
          id: { in: candidateUserIds },
          role: { not: "SUPERADMIN" },
        },
        select: {
          id: true,
          student: { select: { schoolId: true } },
          adminSchools: { select: { id: true } },
          teacherSchools: { select: { id: true } },
        },
      });
      userIdsToDelete = users
        .filter((u) => {
          const studentRemovedOrNone = !u.student || u.student.schoolId === schoolId;
          if (!studentRemovedOrNone) return false;
          const adminOther = u.adminSchools.some((s) => s.id !== schoolId);
          const teacherOther = u.teacherSchools.some((s) => s.id !== schoolId);
          return !adminOther && !teacherOther;
        })
        .map((u) => u.id);
    }

    const ops = [
      prisma.class.updateMany({
        where: { schoolId },
        data: { teacherId: null },
      }),
      prisma.student.deleteMany({ where: { schoolId } }),
      prisma.class.deleteMany({ where: { schoolId } }),
      prisma.school.update({
        where: { id: schoolId },
        data: {
          admins: { set: [] },
          teachers: { set: [] },
        },
      }),
    ];
    if (userIdsToDelete.length > 0) {
      ops.push(
        prisma.user.deleteMany({
          where: { id: { in: userIdsToDelete }, role: { not: "SUPERADMIN" } },
        })
      );
    }
    ops.push(prisma.school.delete({ where: { id: schoolId } }));

    // Prisma 6: array `$transaction` only allows `{ isolationLevel? }` — not `maxWait`/`timeout`
    // (those exist on the interactive callback overload only).
    await prisma.$transaction(ops);

    return NextResponse.json(
      { ok: true, message: `School "${school.name}" and all related data were deleted.` },
      { status: 200 }
    );
  } catch (e: unknown) {
    logger.error("Superadmin school DELETE:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
