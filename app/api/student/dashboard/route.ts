import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { purgeExpiredNewsFeeds } from "@/lib/newsfeedRetention";
import {
  buildParentDashboardFast,
  buildParentDashboardFull,
} from "@/lib/buildParentDashboard";
import {
  parentPortalSwrRead,
  parentPortalSwrWrite,
  PARENT_DASHBOARD_FAST_TTL,
  PARENT_DASHBOARD_FULL_TTL,
} from "@/lib/parentPortalSwr";

declare const globalThis: {
  parentDashboardPurgeLastRunAt?: number;
} & typeof global;

function maybePurgeExpiredNewsFeeds() {
  const now = Date.now();
  const lastRun = globalThis.parentDashboardPurgeLastRunAt ?? 0;
  if (now - lastRun < 10 * 60 * 1000) return;
  globalThis.parentDashboardPurgeLastRunAt = now;
  purgeExpiredNewsFeeds().catch((error) => {
    console.warn("Newsfeed purge skipped due to error:", error);
  });
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !session.user.studentId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const studentId = session.user.studentId;
    const url = new URL(request.url);
    const fastOnly = url.searchParams.get("fast") === "1";
    const bypassCache = url.searchParams.get("refresh") === "1";

    const schoolId = session.user.schoolId;
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const ttl = fastOnly ? PARENT_DASHBOARD_FAST_TTL : PARENT_DASHBOARD_FULL_TTL;
    const serverKey = `parent:${studentId}:dashboard:${fastOnly ? "fast" : "full"}`;
    const cacheParams = { studentId, fast: fastOnly };

    if (!bypassCache) {
      const hit = await parentPortalSwrRead({
        schoolId,
        namespace: "api",
        resource: "parent:dashboard",
        params: cacheParams,
        serverKey,
        ttl,
      });
      if (hit.value) {
        return NextResponse.json(hit.value, { status: 200 });
      }
    }

    let payload;
    if (fastOnly) {
      payload = await buildParentDashboardFast(studentId);
    } else {
      maybePurgeExpiredNewsFeeds();
      payload = await buildParentDashboardFull(studentId, session.user.id);
    }

    if (!payload) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    if (!bypassCache) {
      await parentPortalSwrWrite({
        schoolId,
        namespace: "api",
        resource: "parent:dashboard",
        params: cacheParams,
        serverKey,
        ttl,
        value: payload,
      });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    console.error("Parent home dashboard error:", error);

    const err = error as { code?: string; message?: string; name?: string };
    if (
      err?.code === "P1001" ||
      err?.message?.includes("Can't reach database server") ||
      err?.name === "PrismaClientInitializationError"
    ) {
      return NextResponse.json(
        { message: "Database connection failed. Please check your database configuration." },
        { status: 503 }
      );
    }

    if (err?.message?.includes("statement timeout") || err?.message?.includes("Connection terminated")) {
      return NextResponse.json(
        { message: "Database request timed out. Please try again." },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
