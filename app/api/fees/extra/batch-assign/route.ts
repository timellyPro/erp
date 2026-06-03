import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { batchAssignStudentExtraFees } from "@/lib/batchAssignStudentExtraFees";
import { resolveFeesSchoolIdForSession } from "../../extra-head-templates/resolveSchoolId";

function canManage(role: string | null | undefined) {
  return role === "SCHOOLADMIN" || role === "SUPERADMIN" || role === "TEACHER";
}

/** Assign multiple student-specific fee heads in one transaction (fast vs N× POST /api/fees/extra). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!canManage(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolIdForSession(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const body = await req.json();
    const studentId = String(body?.studentId ?? "").trim();
    const fees = Array.isArray(body?.fees) ? body.fees : [];

    if (!studentId) {
      return NextResponse.json({ message: "studentId is required" }, { status: 400 });
    }
    if (fees.length === 0) {
      return NextResponse.json({ message: "fees array is required" }, { status: 400 });
    }

    const result = await batchAssignStudentExtraFees(schoolId, studentId, fees);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;
    console.error("batch-assign error:", error);
    return NextResponse.json({ message }, { status });
  }
}
