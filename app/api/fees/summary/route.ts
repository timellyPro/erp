import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { resolveFeesSchoolId } from "@/lib/fees/resolveFeesSchoolId";
import { computeCurrentAndPreviousFeeStats } from "@/lib/fees/computeFeeSummaryStats";
import { loadFeeSummaryPage } from "@/lib/fees/loadFeeSummaryPage";
import { withRequestTiming } from "@/lib/cache/requestTiming";
import { tenantCacheKey, swrGet, swrSet } from "@/lib/cache/tenantCache";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/school/schoolDashboardServerCache";
import { getErrorMessage } from "@/lib/errors/errorInfo";
import { logger } from "@/lib/logger";
import { FEE_LIST_SERVER_CACHE_TTL_MS } from "@/lib/fees/feeListServerCache";
import { runInTenantScope } from "@/lib/db/tenantContext";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json(
      { message: "Only school staff can view fee summary" },
      { status: 403 }
    );
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    return await runInTenantScope(schoolId, async () => {    return await withRequestTiming(
      { route: "GET /api/fees/summary", schoolId, userId: session.user.id },
      async () => {
        // Cursor pagination (by studentFee.studentId which is unique).
        const { searchParams } = new URL(req.url);
        const statsOnly = searchParams.get("statsOnly") === "1";

        if (statsOnly) {
          const memKey = `fees:summary:stats:active:${schoolId}`;
          const memCached = getSchoolDashboardServerCached<{
            fees: unknown[];
            stats: unknown;
            nextCursor: null;
          }>(memKey);
          if (memCached) {
            return NextResponse.json(memCached, { status: 200 });
          }

          const stats = await computeCurrentAndPreviousFeeStats(schoolId);

          const payload = { fees: [] as unknown[], stats, nextCursor: null };
          setSchoolDashboardServerCached(memKey, payload, FEE_LIST_SERVER_CACHE_TTL_MS);
          return NextResponse.json(payload, { status: 200 });
        }

        const takeParam = searchParams.get("take");
        const takeRaw = takeParam ? Number(takeParam) : 50;
        const take = Math.min(100, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 50));
        const cursor = searchParams.get("cursor")?.trim() || null;

        const memPageKey = `fees:summary:page:active:${schoolId}:${take}:${cursor ?? "0"}`;
        const memPage = getSchoolDashboardServerCached(memPageKey);
        if (memPage) {
          return NextResponse.json(memPage, { status: 200 });
        }

        const cacheKey = await tenantCacheKey(schoolId, "api", "fees:summary:page:active", { take, cursor });
        const cached = await swrGet<{ fees: unknown[]; stats: unknown; nextCursor: string | null }>(cacheKey);
        const now = Date.now();
        if (cached && now < cached.freshUntil) {
          return NextResponse.json({ ...cached.value, cache: "fresh" }, { status: 200 });
        }

        const payload = await loadFeeSummaryPage(schoolId, take, cursor);
        setSchoolDashboardServerCached(memPageKey, payload, 15_000);
        await swrSet(
          cacheKey,
          { value: payload, freshUntil: now + 5_000, staleUntil: now + 60_000 },
          60
        );

        return NextResponse.json(payload, { status: 200 });
      }
    );
    });
  } catch (error: unknown) {
    logger.error("Fee summary error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}

