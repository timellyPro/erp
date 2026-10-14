import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { getApplicationGateRow } from "@/lib/admission/admissionsListQuery";
import { assertCanManageAdmissions, getSessionSchoolId } from "../../_utils";
import { enrollStudentFromAdmissionApplication } from "@/lib/admission/enrollStudentFromAdmissionApplication";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });
    return await runInTenantScope(schoolId, async (schoolId) => {

    const { id } = await ctx.params;

    const pre = await getApplicationGateRow(prisma, id, schoolId);
    if (!pre) return NextResponse.json({ message: "Not found" }, { status: 404 });
    if (pre.studentId) {
      return NextResponse.json({ message: "Already enrolled" }, { status: 400 });
    }
    if (pre.workflowStatus !== "PENDING" && pre.workflowStatus !== "UPCOMING") {
      return NextResponse.json(
        { message: "Only Pending or Upcoming applications can be approved for enrollment" },
        { status: 400 }
      );
    }

    const { studentId } = await enrollStudentFromAdmissionApplication({ applicationId: id, schoolId });

    return NextResponse.json(
      { message: "Student created and linked to this admission", studentId },
      { status: 200 }
    );
    });
  } catch (e: unknown) {
    const err = e as { message?: string; statusCode?: number };
    return NextResponse.json(
      { message: err?.message ?? "Internal server error" },
      { status: err?.statusCode ?? 500 }
    );
  }
}
