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

    const collectors = rows
      .filter((r) => r.collectedByUserId)
      .map((r) => ({
        userId: r.collectedByUserId as string,
        name: (r._max.collectedByName || "").trim() || "Staff",
      }))
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
