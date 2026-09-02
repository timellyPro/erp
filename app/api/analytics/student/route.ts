import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { computeParentAnalytics } from "@/lib/computeParentAnalytics";
import {
  parentPortalSwrRead,
  parentPortalSwrWrite,
  PARENT_ANALYTICS_TTL,
} from "@/lib/parentPortalSwr";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const studentId = session.user.studentId;

    if (!studentId) {
      return NextResponse.json(
        { message: "No student linked to this account" },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const fastOnly = url.searchParams.get("fast") === "1";
    const bypassCache = url.searchParams.get("refresh") === "1";

    const schoolId = session.user.schoolId;
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const serverKey = `parent:${studentId}:analytics:${fastOnly ? "fast" : "full"}`;
    const cacheParams = { studentId, fast: fastOnly };

    if (!bypassCache) {
      const hit = await parentPortalSwrRead({
        schoolId,
        namespace: "api",
        resource: "parent:analytics",
        params: cacheParams,
        serverKey,
        ttl: PARENT_ANALYTICS_TTL,
      });
      if (hit.value) {
        return NextResponse.json(hit.value, { status: 200 });
      }
    }

    const response = await computeParentAnalytics(studentId, { fast: fastOnly });
    if (!response) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    if (!bypassCache) {
      await parentPortalSwrWrite({
        schoolId,
        namespace: "api",
        resource: "parent:analytics",
        params: cacheParams,
        serverKey,
        ttl: PARENT_ANALYTICS_TTL,
        value: response,
      });
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("Analytics error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
