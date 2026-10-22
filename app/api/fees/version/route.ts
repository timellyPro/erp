import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { runInTenantScope } from "@/lib/db/tenantContext";
import { resolveFeesSchoolId } from "@/lib/fees/resolveFeesSchoolId";
import { getSchoolFeeDataVersion } from "@/lib/fees/feeDataVersion";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/**
 * GET /api/fees/version
 * The school's fee-data counter (see lib/fees/feeDataVersion.ts). A browser that holds a cached copy of a
 * student's fee details compares it with the number it saw last and throws its copies away when it moved.
 * Returns only a number, so any signed-in user of a school may read it.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }
    const version = await runInTenantScope(schoolId, () => getSchoolFeeDataVersion(schoolId));
    return NextResponse.json({ version }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Fee data version error:", error);
    return NextResponse.json({ message: toClientErrorMessage(error, "Internal server error") }, { status: 500 });
  }
}
