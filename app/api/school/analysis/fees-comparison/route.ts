import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { buildFeesComparisonReport } from "@/lib/fees/buildFeesComparisonReport";
import { resolveSchoolAdminSchoolId } from "@/lib/school/resolveSchoolAdminSchoolId";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/school/schoolDashboardServerCache";
import { runInTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  if (!isAdmin) {
    return NextResponse.json({ message: "Only admins can view analysis" }, { status: 403 });
  }

  try {
    const ctx = await resolveSchoolAdminSchoolId(session);
    if ("error" in ctx) {
      return NextResponse.json({ message: ctx.error }, { status: ctx.status });
    }

    const { searchParams } = new URL(req.url);
    const rangeAFrom = searchParams.get("rangeAFrom");
    const rangeATo = searchParams.get("rangeATo");
    const rangeBFrom = searchParams.get("rangeBFrom");
    const rangeBTo = searchParams.get("rangeBTo");
    const cacheKey = [
      "analysis:fees-comparison",
      ctx.schoolId,
      rangeAFrom,
      rangeATo,
      rangeBFrom,
      rangeBTo,
    ].join(":");
    const cached = getSchoolDashboardServerCached<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    const report = await runInTenantScope(ctx.schoolId, () =>
      buildFeesComparisonReport(ctx.schoolId, {
        rangeAFrom,
        rangeATo,
        rangeBFrom,
        rangeBTo,
      })
    );

    setSchoolDashboardServerCached(cacheKey, report, 60_000);
    return NextResponse.json(report);
  } catch (error) {
    logger.error("Fees comparison API error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
