import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  buildSchoolDashboardCollection,
  buildSchoolDashboardCollectionByHead,
  buildSchoolDashboardCollectionSummary,
} from "@/lib/buildSchoolDashboardCollection";
import { resolveSchoolAdminSchoolId } from "@/lib/resolveSchoolAdminSchoolId";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/schoolDashboardServerCache";

/** Day collection — ?part=summary | heads (fast) or full payload (default). */
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
    const part = url.searchParams.get("part")?.trim() || "full";
    const cacheKey = `dashboard:collection:${part}:${ctx.schoolId}:${date ?? "today"}`;
    const cached = getSchoolDashboardServerCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    let payload: unknown;
    if (part === "summary") {
      payload = await buildSchoolDashboardCollectionSummary(ctx.schoolId, date);
    } else if (part === "heads") {
      payload = await buildSchoolDashboardCollectionByHead(ctx.schoolId, date);
    } else {
      payload = await buildSchoolDashboardCollection(ctx.schoolId, date);
    }

    setSchoolDashboardServerCached(cacheKey, payload, part === "summary" ? 120_000 : 90_000);
    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    console.error("Dashboard collection error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
