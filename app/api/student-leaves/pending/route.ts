import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const role = session.user.role;
    if (role !== "TEACHER" && role !== "SCHOOLADMIN") {
      return NextResponse.json({ message: "Only teachers or school admin can view pending student leaves" }, { status: 403 });
    }

    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const school = await prisma.school.findFirst({
        where: {
          OR: [
            { admins: { some: { id: session.user.id } } },
            { teachers: { some: { id: session.user.id } } },
          ],
        },
        select: { id: true },
      });
      schoolId = school?.id ?? null;
    }
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go through
    // the app_tenant connection, restricted by RLS, not just this route's own
    // `where: { schoolId }` filter.
    const leaves = await withTenantScopedClient(schoolId, (tx) =>
      tx.studentLeaveRequest.findMany({
        where: {
          schoolId,
          status: "PENDING", // only pending
        },
        select: {
          id: true,
          leaveType: true,
          reason: true,
          fromDate: true,
          toDate: true,
          status: true,
          remarks: true,
          createdAt: true,

          student: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  photoUrl: true, // needed for avatar
                },
              },
              class: {
                select: {
                  id: true,
                  name: true,
                  section: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    );

    return NextResponse.json(leaves, { status: 200 });
  } catch (e: unknown) {
    logger.error("Student leaves pending:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
