import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { buildParentProfileShell } from "@/lib/parent/buildParentProfileShell";
import {
  parentPortalSwrRead,
  parentPortalSwrWrite,
  PARENT_LIST_TTL,
} from "@/lib/parent/parentPortalSwr";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.studentId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const studentId = session.user.studentId;
    const schoolId = session.user.schoolId;
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const bypassCache = new URL(request.url).searchParams.get("refresh") === "1";
    const serverKey = `parent:${studentId}:profile:shell`;

    if (!bypassCache) {
      const hit = await parentPortalSwrRead({
        schoolId,
        namespace: "api",
        resource: "parent:profile-shell",
        params: { studentId },
        serverKey,
        ttl: PARENT_LIST_TTL,
      });
      if (hit.value) return NextResponse.json(hit.value, { status: 200 });
    }

    const payload = await buildParentProfileShell(studentId);
    if (!payload) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    if (!bypassCache) {
      await parentPortalSwrWrite({
        schoolId,
        namespace: "api",
        resource: "parent:profile-shell",
        params: { studentId },
        serverKey,
        ttl: PARENT_LIST_TTL,
        value: payload,
      });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    logger.error("Parent profile shell error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
