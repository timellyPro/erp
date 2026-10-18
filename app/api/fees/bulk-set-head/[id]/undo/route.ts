import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { runInTenantScope } from "@/lib/db/tenantContext";
import { resolveFeesSchoolId } from "@/lib/fees/resolveFeesSchoolId";
import { auditActorFromSession } from "@/lib/fees/paymentAudit";
import { BulkEditConflictError, BulkEditNotFoundError, undoBulkSetFeeHead } from "@/lib/fees/bulkSetFeeHead";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export const maxDuration = 60;

/** POST: undo a whole bulk edit (all or nothing). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ message: "Only a school admin can undo a bulk edit" }, { status: 403 });
    }
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });
    const { id } = await params;

    return await runInTenantScope(schoolId, async (schoolId) => {
      const result = await undoBulkSetFeeHead(schoolId, id, auditActorFromSession(session));
      return NextResponse.json(result);
    });
  } catch (error: unknown) {
    if (error instanceof BulkEditNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof BulkEditConflictError) return NextResponse.json({ message: error.message }, { status: 409 });
    logger.error("bulk-set-head undo error:", error);
    return NextResponse.json({ message: toClientErrorMessage(error, "Internal server error") }, { status: 500 });
  }
}
