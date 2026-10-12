import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import {
  buildSchoolDashboardCollection,
  buildSchoolDashboardCollectionByHead,
  buildSchoolDashboardCollectionSummary,
} from "@/lib/school/buildSchoolDashboardCollection";
import { resolveSchoolAdminSchoolId } from "@/lib/school/resolveSchoolAdminSchoolId";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/school/schoolDashboardServerCache";
import { runInTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/** Day collection — ?from=YYYY-MM-DD&to=YYYY-MM-DD&part=summary | heads (fast) or full payload. */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  if (!isAdmin) {
    return NextResponse.json({ message: "Only admins can view school dashboard" }, { status: 403 });
  }

  try {
    const ctx = await resolveSchoolAdminSchoolId(session);
    if ("error" in ctx) {
      return NextResponse.json({ message: ctx.error }, { status: ctx.status });
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date")?.trim() || undefined;
    const from = url.searchParams.get("from")?.trim() || date;
    const to = url.searchParams.get("to")?.trim() || from;
    const part = url.searchParams.get("part")?.trim() || "full";
    const cacheKey = `dashboard:collection:${part}:${ctx.schoolId}:${from ?? "today"}:${to ?? from ?? "today"}`;
    const cached = getSchoolDashboardServerCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    const payload: unknown = await runInTenantScope<unknown>(ctx.schoolId, async () => {
      if (part === "summary") return buildSchoolDashboardCollectionSummary(ctx.schoolId, from, to);
      if (part === "heads") return buildSchoolDashboardCollectionByHead(ctx.schoolId, from, to);
      return buildSchoolDashboardCollection(ctx.schoolId, from, to);
    });

    setSchoolDashboardServerCached(cacheKey, payload, part === "summary" ? 120_000 : 90_000);
    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    logger.error("Dashboard collection error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
