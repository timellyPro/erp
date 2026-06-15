import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";

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

    const rows = await prisma.payment.groupBy({
      by: ["collectedByUserId"],
      where: {
        student: { schoolId },
        purpose: "FEES",
        status: { in: ["SUCCESS", "COMPLETED"] },
        collectedByUserId: { not: null },
      },
      _max: { collectedByName: true },
    });

    const userIds = rows
      .map((r) => r.collectedByUserId)
      .filter((id): id is string => Boolean(id));
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
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
    console.error("Fee collectors error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
