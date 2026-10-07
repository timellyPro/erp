import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { invalidateStudentFeeReadCaches } from "@/lib/studentFeeReadCache";
import { invalidateDiscountApprovalsListCache } from "@/lib/discountApprovalsListCache";

type RouteParams =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };

async function reviewDiscount(req: Request, context: RouteParams) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const id = resolved.id;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const role = String(session.user.role);
  if (role !== "CHAIRMAN" && role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Only chairman can approve discounts" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action.toUpperCase() : "";
  const reviewRemarks =
    typeof body.reviewRemarks === "string" && body.reviewRemarks.trim()
      ? body.reviewRemarks.trim()
      : null;

  if (action !== "APPROVE" && action !== "REJECT" && action !== "REVERT") {
    return NextResponse.json({ message: "action must be APPROVE, REJECT or REVERT" }, { status: 400 });
  }

  const [approval] = await prisma.$queryRaw<
    Array<{
      id: string;
      schoolId: string;
      studentId: string;
      studentFeeId: string;
      status: string;
      totalFee: number;
      discountPercent: number;
      discountFixedAmount: number | null;
      finalFee: number;
      discountFeeHeadKey: string | null;
      discountFeeHeadLabel: string | null;
      discountRemarks: string | null;
      amountPaid: number;
      studentTotalFee: number;
    }>
  >`
    SELECT
      fda.id,
      fda."schoolId",
      fda."studentId",
      fda."studentFeeId",
      fda.status::text AS status,
      fda."totalFee",
      fda."discountPercent",
      fda."discountFixedAmount",
      fda."finalFee",
      fda."discountFeeHeadKey",
      fda."discountFeeHeadLabel",
      fda."discountRemarks",
      sf."amountPaid",
      sf."totalFee" AS "studentTotalFee"
    FROM "FeeDiscountApproval" fda
    JOIN "StudentFee" sf ON sf.id = fda."studentFeeId"
    WHERE fda.id = ${id}
    LIMIT 1
  `;

  if (!approval) {
    return NextResponse.json({ message: "Approval request not found" }, { status: 404 });
  }

  const sessionSchoolId =
    typeof session.user.schoolId === "string" && session.user.schoolId.trim()
      ? session.user.schoolId
      : null;
  if (role !== "SUPERADMIN" && sessionSchoolId !== approval.schoolId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if ((action === "APPROVE" || action === "REJECT") && approval.status !== "PENDING") {
    return NextResponse.json({ message: "This request is already reviewed" }, { status: 400 });
  }
  if (action === "REVERT" && approval.status !== "APPROVED") {
    return NextResponse.json({ message: "Only approved discounts can be reverted" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    const recalculateStudentFee = async () => {
      const totalFee = Math.max(Number(approval.studentTotalFee || approval.totalFee || 0), 0);
      const approvedRows = await tx.$queryRaw<
        Array<{
          discountPercent: number;
          discountFixedAmount: number | null;
          discountFeeHeadKey: string | null;
          discountFeeHeadLabel: string | null;
          discountRemarks: string | null;
        }>
      >`
        SELECT
          "discountPercent",
          "discountFixedAmount",
          "discountFeeHeadKey",
          "discountFeeHeadLabel",
          "discountRemarks"
        FROM "FeeDiscountApproval"
        WHERE "studentId" = ${approval.studentId}
          AND status::text = 'APPROVED'
        ORDER BY COALESCE("reviewedAt", "createdAt") DESC
      `;
      const totalDiscount = approvedRows.reduce((sum, row) => {
        const fixed = Number(row.discountFixedAmount || 0);
        if (fixed > 0) return sum + fixed;
        return sum + totalFee * (Number(row.discountPercent || 0) / 100);
      }, 0);
      const finalFee = Math.max(Math.round((totalFee - totalDiscount) * 100) / 100, 0);
      const remainingFee = Math.max(finalFee - approval.amountPaid, 0);
      const discountPercent = totalFee > 0 ? (totalDiscount / totalFee) * 100 : 0;
      const latest = approvedRows[0] ?? null;

      await tx.$executeRaw`
        UPDATE "StudentFee"
        SET "totalFee" = ${totalFee},
            "discountPercent" = ${discountPercent},
            "finalFee" = ${finalFee},
            "remainingFee" = ${remainingFee},
            "discountFeeHeadKey" = ${latest?.discountFeeHeadKey ?? null},
            "discountFeeHeadLabel" = ${latest?.discountFeeHeadLabel ?? null},
            "discountRemarks" = ${latest?.discountRemarks ?? null},
            "updatedAt" = NOW()
        WHERE id = ${approval.studentFeeId}
      `;
    };

    if (action === "REJECT") {
      await tx.$executeRaw`
        UPDATE "FeeDiscountApproval"
        SET status = CAST('REJECTED' AS "DiscountApprovalStatus"),
            "reviewedById" = ${session.user.id},
            "reviewRemarks" = ${reviewRemarks},
            "reviewedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE id = ${id}
      `;
      return;
    }

    if (action === "REVERT") {
      const revertRemarks = reviewRemarks
        ? `Reverted by chairman: ${reviewRemarks}`
        : "Reverted by chairman";
      await tx.$executeRaw`
        UPDATE "FeeDiscountApproval"
        SET status = CAST('REJECTED' AS "DiscountApprovalStatus"),
            "reviewedById" = ${session.user.id},
            "reviewRemarks" = ${revertRemarks},
            "reviewedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE id = ${id}
      `;
      await recalculateStudentFee();
      return;
    }

    await tx.$executeRaw`
      UPDATE "FeeDiscountApproval"
      SET status = CAST('APPROVED' AS "DiscountApprovalStatus"),
          "reviewedById" = ${session.user.id},
          "reviewRemarks" = ${reviewRemarks},
          "reviewedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE id = ${id}
    `;
    await recalculateStudentFee();
  });

  await invalidateStudentFeeReadCaches({
    studentId: approval.studentId,
    schoolId: approval.schoolId,
  });
  invalidateDiscountApprovalsListCache(approval.schoolId);

  return NextResponse.json({
    message:
      action === "APPROVE"
        ? "Discount approved and applied"
        : action === "REVERT"
          ? "Discount reverted and fee restored"
          : "Discount rejected",
  });
}

export async function POST(req: Request, context: RouteParams) {
  return reviewDiscount(req, context);
}

export async function PATCH(req: Request, context: RouteParams) {
  return reviewDiscount(req, context);
}
