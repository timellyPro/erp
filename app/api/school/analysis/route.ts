import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  buildSchoolAnalysisFast,
  buildSchoolAnalysisFull,
  buildSchoolAnalysisTables,
} from "@/lib/buildSchoolAnalysis";
import { resolveAnalysisStartYear } from "@/lib/schoolAnalysisYear";
import { resolveSchoolAdminSchoolId } from "@/lib/resolveSchoolAdminSchoolId";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/schoolDashboardServerCache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  if (!isAdmin) {
    return NextResponse.json(
      { message: "Only admins can view analysis" },
      { status: 403 }
    );
  }

  try {
    const ctx = await resolveSchoolAdminSchoolId(session);
    if ("error" in ctx) {
      return NextResponse.json({ message: ctx.error }, { status: ctx.status });
    }
    const schoolId = ctx.schoolId;

    const { searchParams } = new URL(req.url);
    const startYear = resolveAnalysisStartYear(searchParams.get("year"));
    const classIdParam = searchParams.get("classId");
    const classId = classIdParam && classIdParam.trim() ? classIdParam.trim() : null;
    const fastOnly = searchParams.get("fast") === "1";
    const tablesOnly = searchParams.get("part") === "tables";

    const cacheKey = `analysis:${schoolId}:${startYear}:${classId ?? "all"}:${fastOnly ? "fast" : tablesOnly ? "tables" : "full"}`;
    const cached = getSchoolDashboardServerCached<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    let payload: Record<string, unknown>;
    const ttlMs = fastOnly ? 300_000 : 120_000;

    if (fastOnly) {
      payload = await buildSchoolAnalysisFast(schoolId, startYear, classId);
    } else if (tablesOnly) {
      payload = await buildSchoolAnalysisTables(schoolId, startYear, classId);
    } else {
      payload = await buildSchoolAnalysisFull(schoolId, startYear, classId);
    }

    setSchoolDashboardServerCached(cacheKey, payload, ttlMs);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Analysis API error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
