import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { resolveFeesSchoolId } from "@/lib/fees/resolveFeesSchoolId";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/**
 * GET /api/fees/collectors
 * Distinct staff who recorded offline fee payments for this school.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { student: { schoolId } }` filter above.
    const { rows, users } = await withTenantScopedClient(schoolId, async (tx) => {
      const groupRows = await tx.payment.groupBy({
        by: ["collectedByUserId"],
        where: {
          student: { schoolId },
          purpose: "FEES",
          status: { in: ["SUCCESS", "COMPLETED"] },
          collectedByUserId: { not: null },
        },
        _max: { collectedByName: true },
      });

      const userIds = groupRows
        .map((r) => r.collectedByUserId)
        .filter((id): id is string => Boolean(id));
      const userRows =
        userIds.length > 0
          ? await tx.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, name: true, email: true },
            })
          : [];
      return { rows: groupRows, users: userRows };
    });
    const userLabelById = new Map(
      users.map((u) => [u.id, (u.name || "").trim() || (u.email || "").trim() || "Staff"])
    );

    const collectors = rows
      .filter((r) => r.collectedByUserId)
      .map((r) => {
        const userId = r.collectedByUserId as string;
        const name =
          (r._max.collectedByName || "").trim() ||
          userLabelById.get(userId) ||
          "Staff";
        return { userId, name };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ collectors }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Fee collectors error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
