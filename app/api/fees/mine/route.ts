import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { buildParentFeesMine } from "@/lib/parent/buildParentFeesMine";
import {
  parentPortalSwrRead,
  parentPortalSwrWrite,
  PARENT_LIST_TTL,
} from "@/lib/parent/parentPortalSwr";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "STUDENT" || !session.user.studentId) {
    return NextResponse.json(
      { message: "Only students can view their fee details" },
      { status: 403 }
    );
  }

  try {
    const studentId = session.user.studentId;
    const schoolId = session.user.schoolId;
    const bypassCache = new URL(request.url).searchParams.get("refresh") === "1";
    const serverKey = `parent:${studentId}:fees:mine`;

    if (!bypassCache && schoolId) {
      const hit = await parentPortalSwrRead({
        schoolId,
        namespace: "api",
        resource: "parent:fees",
        params: { studentId },
        serverKey,
        ttl: PARENT_LIST_TTL,
      });
      if (hit.value) {
        return NextResponse.json({ fee: hit.value }, { status: 200 });
      }
    }

    const fee = await buildParentFeesMine(studentId);
    if (!fee) {
      return NextResponse.json(
        { message: "Fee details not found for this student" },
        { status: 404 }
      );
    }

    if (!bypassCache && schoolId) {
      await parentPortalSwrWrite({
        schoolId,
        namespace: "api",
        resource: "parent:fees",
        params: { studentId },
        serverKey,
        ttl: PARENT_LIST_TTL,
        value: fee,
      });
    }

    return NextResponse.json({ fee }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Fetch student fee error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
