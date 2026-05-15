import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { computeAdminStudentFeeBreakdown } from "@/lib/computeAdminStudentFeeBreakdown";

async function getSchoolId(session: { user: { id: string; schoolId?: string | null } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  if (!schoolId) {
    const teacherClass = await prisma.class.findFirst({
      where: { teacherId: session.user.id },
      select: { schoolId: true },
    });
    schoolId = teacherClass?.schoolId ?? null;
  }
  if (!schoolId) {
    const teacherSchool = await prisma.school.findFirst({
      where: { teachers: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = teacherSchool?.id ?? null;
  }
  return schoolId;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const canManageFees =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManageFees) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  try {
    const schoolId = await getSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId")?.trim();
    if (!studentId) return NextResponse.json({ message: "studentId is required" }, { status: 400 });

    const skipMigrate =
      searchParams.get("skipMigrate") === "1" ||
      searchParams.get("fast") === "1";

    const result = await computeAdminStudentFeeBreakdown(schoolId, studentId, {
      migrateLumps: !skipMigrate,
      cleanupHostelMessDuplicates: false,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("Fee record not found")) {
      return NextResponse.json({ message }, { status: 404 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ message }, { status: 404 });
    }
    console.error("Admin fee breakdown error:", error);
    return NextResponse.json({ message }, { status: 500 });
  }
}
