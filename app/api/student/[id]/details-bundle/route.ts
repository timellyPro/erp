import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { buildStudentDetailsTabPayload } from "@/lib/buildStudentDetailsTabPayload";
import { computeAdminStudentFeeBreakdown } from "@/lib/computeAdminStudentFeeBreakdown";

type RouteParams =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null; role: string };
}) {
  let schoolId = session.user.schoolId;
  if (!schoolId && (session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN")) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  return schoolId;
}

const BREAKDOWN_TIMEOUT_MS = 12_000;

async function loadFeeBreakdownSafe(schoolId: string, studentId: string) {
  try {
    return await Promise.race([
      computeAdminStudentFeeBreakdown(schoolId, studentId, {
        migrateLumps: false,
        cleanupHostelMessDuplicates: false,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), BREAKDOWN_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

/** One request for student details tab: profile payload + fee breakdown (no lump migration on read). */
export async function GET(req: Request, context: RouteParams) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const id = resolved.id;
  const profileOnly = new URL(req.url).searchParams.get("profileOnly") === "1";

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const hasFeature =
    session.user.role === "TEACHER" &&
    (session.user.allowedFeatures?.includes("STUDENTS") ||
      session.user.allowedFeatures?.includes("STUDENT_DETAILS"));
  const isOwnStudent = session.user.studentId === id;

  if (!isAdmin && !isOwnStudent && !hasFeature) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveSchoolId(session);

    const resolvedSchoolId = schoolId ?? null;
    const detail = await buildStudentDetailsTabPayload(id, resolvedSchoolId);
    if (!detail) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    if (profileOnly) {
      return NextResponse.json({ ...detail, feeBreakdown: null }, { status: 200 });
    }

    const feeBreakdown = resolvedSchoolId
      ? await loadFeeBreakdownSafe(resolvedSchoolId, id)
      : null;

    return NextResponse.json({ ...detail, feeBreakdown }, { status: 200 });
  } catch (error: unknown) {
    console.error("Student details bundle error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
