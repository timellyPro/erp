import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { getApplicationGateRow, setApplicationWorkflowPendingOrUpcoming } from "@/lib/admissionsListQuery";
import { assertCanManageAdmissions, getSessionSchoolId } from "../../_utils";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const next = typeof body?.workflowStatus === "string" ? body.workflowStatus.toUpperCase() : "";

    if (next !== "PENDING" && next !== "UPCOMING") {
      return NextResponse.json(
        { message: "workflowStatus must be PENDING or UPCOMING (use enroll to approve)" },
        { status: 400 }
      );
    }

    const row = await getApplicationGateRow(prisma, id, schoolId);
    if (!row) return NextResponse.json({ message: "Not found" }, { status: 404 });

    if (row.studentId) {
      return NextResponse.json({ message: "Cannot change workflow after a student is enrolled" }, { status: 400 });
    }

    const nextEnum = next as "PENDING" | "UPCOMING";

    await setApplicationWorkflowPendingOrUpcoming(prisma, id, schoolId, nextEnum);

    return NextResponse.json({ message: "Updated", workflowStatus: next }, { status: 200 });
  } catch (e: unknown) {
    const err = e as { message?: string; statusCode?: number };
    return NextResponse.json(
      { message: err?.message ?? "Internal server error" },
      { status: err?.statusCode ?? 500 }
    );
  }
}
