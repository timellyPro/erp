import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { batchAssignStudentExtraFees } from "@/lib/fees/batchAssignStudentExtraFees";
import { resolveFeesSchoolIdForSession } from "../../extra-head-templates/resolveSchoolId";
import { invalidateStudentFeeReadCaches } from "@/lib/fees/studentFeeReadCache";
import { logger } from "@/lib/logger";
import { runInTenantScope } from "@/lib/db/tenantContext";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

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
    return await runInTenantScope(schoolId, async (schoolId) => {

    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    const body = parsedBody.success ? parsedBody.data : {};
    const studentId = String(body?.studentId ?? "").trim();
    const fees = Array.isArray(body?.fees) ? body.fees : [];

    if (!studentId) {
      return NextResponse.json({ message: "studentId is required" }, { status: 400 });
    }
    if (fees.length === 0) {
      return NextResponse.json({ message: "fees array is required" }, { status: 400 });
    }

    const result = await batchAssignStudentExtraFees(schoolId, studentId, fees);
    invalidateStudentFeeReadCaches({ studentId, schoolId });
    return NextResponse.json(result, { status: 201 });
    });
  } catch (error: unknown) {
    const message = toClientErrorMessage(error, "Internal server error");
    const status = message.includes("not found") ? 404 : 500;
    logger.error("batch-assign error:", error);
    return NextResponse.json({ message }, { status });
  }
}
