import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
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
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const bypassCache = new URL(request.url).searchParams.get("refresh") === "1";

    const student = await prisma.student.findFirst({
      where: { userId: session.user.id },
      select: { id: true, schoolId: true },
    });
    if (!student) return NextResponse.json({ message: "Student not found" }, { status: 400 });

    const serverKey = `parent:${student.id}:leaves:my`;
    if (!bypassCache) {
      const hit = await parentPortalSwrRead<unknown[]>({
        schoolId: student.schoolId,
        namespace: "api",
        resource: "parent:leaves:my",
        params: { studentId: student.id },
        serverKey,
        ttl: PARENT_LIST_TTL,
      });
      if (hit.value) {
        return NextResponse.json(hit.value, { status: 200 });
      }
    }

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): read goes
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { studentId }` filter above.
    const leaves = await withTenantScopedClient(student.schoolId, (tx) =>
      tx.studentLeaveRequest.findMany({
        where: { studentId: student.id },
        orderBy: { fromDate: "desc" },
      })
    );

    if (!bypassCache) {
      await parentPortalSwrWrite({
        schoolId: student.schoolId,
        namespace: "api",
        resource: "parent:leaves:my",
        params: { studentId: student.id },
        serverKey,
        ttl: PARENT_LIST_TTL,
        value: leaves,
      });
    }

    return NextResponse.json(leaves, { status: 200 });
  } catch (e: unknown) {
    logger.error("Student leaves my:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
