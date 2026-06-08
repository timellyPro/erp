import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { buildParentBootstrap } from "@/lib/buildParentBootstrap";
import { getParentPortalServerCached } from "@/lib/parentPortalServerCache";

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
    const memKey = `parent:${studentId}:bootstrap`;

    if (!bypassCache) {
      const memHit = getParentPortalServerCached(memKey);
      if (memHit) return NextResponse.json(memHit, { status: 200 });
    }

    const payload = await buildParentBootstrap(studentId, session.user.id, schoolId);
    if (!payload) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    console.error("Parent bootstrap error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
