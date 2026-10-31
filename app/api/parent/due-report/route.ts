import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { runInTenantScope } from "@/lib/db/tenantContext";
import { schoolIdViaStudentId } from "@/lib/auth/tenant";
import { buildStudentFeeDueReport } from "@/lib/fees/buildStudentFeeDueReport";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/**
 * The signed-in parent/student's own fee due report (same calculation as the school admin's Fee Due Report).
 * The student is always the one in the session; nothing in the request can pick another student or school.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "STUDENT" || !session.user.studentId) {
    return NextResponse.json({ message: "Only students can view their fee due report" }, { status: 403 });
  }

  try {
    const studentId = session.user.studentId;
    const schoolId = session.user.schoolId?.trim() || (await schoolIdViaStudentId(studentId));
    if (!schoolId) {
      return NextResponse.json({ message: "School not found in session" }, { status: 400 });
    }

    const report = await runInTenantScope(schoolId, () => buildStudentFeeDueReport(schoolId, studentId));
    if (!report) {
      return NextResponse.json({ message: "Fee details not found for this student" }, { status: 404 });
    }

    // Money figures must never be served from a browser or CDN cache.
    return NextResponse.json({ report }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    logger.error("Parent fee due report error:", error);
    return NextResponse.json({ message: toClientErrorMessage(error, "Internal server error") }, { status: 500 });
  }
}
