import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

type RouteParams =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteParams) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const studentId = resolved.id;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const role = String(session.user.role);
  if (!["SCHOOLADMIN", "SUPERADMIN", "TEACHER", "CHAIRMAN"].includes(role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const sessionSchoolId =
    typeof session.user.schoolId === "string" && session.user.schoolId.trim()
      ? session.user.schoolId
      : null;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
      discountFixedAmount: number | null;
      discountFeeHeadKey: string | null;
      discountFeeHeadLabel: string | null;
      discountRemarks: string | null;
      createdAt: Date;
      schoolId: string;
    }>
  >`
    SELECT
      fda.id,
      fda.status::text AS status,
      fda."discountFixedAmount",
      fda."discountFeeHeadKey",
      fda."discountFeeHeadLabel",
      fda."discountRemarks",
      fda."createdAt",
      fda."schoolId"
    FROM "FeeDiscountApproval" fda
    WHERE fda."studentId" = ${studentId}
      AND (${role} = 'SUPERADMIN' OR ${sessionSchoolId} IS NULL OR fda."schoolId" = ${sessionSchoolId})
    ORDER BY fda."createdAt" DESC
    LIMIT 10
  `;

  return NextResponse.json({
    approvals: rows.map((row) => ({
      id: row.id,
      status: row.status,
      discountFixedAmount: row.discountFixedAmount,
      discountFeeHeadKey: row.discountFeeHeadKey,
      discountFeeHeadLabel: row.discountFeeHeadLabel,
      discountRemarks: row.discountRemarks,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
