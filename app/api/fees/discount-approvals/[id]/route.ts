import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { invalidateStudentFeeReadCaches } from "@/lib/fees/studentFeeReadCache";
import { recalculateFeeAfterDiscountApproval } from "@/lib/fees/applyDiscountApproval";
import { invalidateDiscountApprovalsListCache } from "@/lib/fees/discountApprovalsListCache";

class AlreadyReviewedError extends Error {}

const reviewDiscountBodySchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REVERT"]),
  reviewRemarks: z.string().trim().min(1).optional().nullable(),
});

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

  const rawBody = await req.json().catch(() => ({}));
  if (typeof rawBody.action === "string") rawBody.action = rawBody.action.toUpperCase();
  const parsed = reviewDiscountBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "action must be APPROVE, REJECT or REVERT" },
      { status: 400 }
    );
  }
  const { action } = parsed.data;
  const reviewRemarks = parsed.data.reviewRemarks?.trim() || null;

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

  try {
  await runInTenantScope(approval.schoolId, () => prisma.$transaction(async (tx) => {
    const recalculateStudentFee = () =>
      recalculateFeeAfterDiscountApproval(tx, {
        schoolId: approval.schoolId,
        studentId: approval.studentId,
        studentFeeId: approval.studentFeeId,
      });

    if (action === "REJECT") {
      const changed = await tx.$executeRaw`
        UPDATE "FeeDiscountApproval"
        SET status = CAST('REJECTED' AS "DiscountApprovalStatus"),
            "reviewedById" = ${session.user.id},
            "reviewRemarks" = ${reviewRemarks},
            "reviewedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE id = ${id} AND status::text = 'PENDING'
      `;
      if (changed === 0) throw new AlreadyReviewedError();
      return;
    }

    if (action === "REVERT") {
      const revertRemarks = reviewRemarks
        ? `Reverted by chairman: ${reviewRemarks}`
        : "Reverted by chairman";
      const changed = await tx.$executeRaw`
        UPDATE "FeeDiscountApproval"
        SET status = CAST('REJECTED' AS "DiscountApprovalStatus"),
            "reviewedById" = ${session.user.id},
            "reviewRemarks" = ${revertRemarks},
            "reviewedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE id = ${id} AND status::text = 'APPROVED'
      `;
      if (changed === 0) throw new AlreadyReviewedError();
      await recalculateStudentFee();
      return;
    }

    const changed = await tx.$executeRaw`
      UPDATE "FeeDiscountApproval"
      SET status = CAST('APPROVED' AS "DiscountApprovalStatus"),
          "reviewedById" = ${session.user.id},
          "reviewRemarks" = ${reviewRemarks},
          "reviewedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE id = ${id} AND status::text = 'PENDING'
    `;
    if (changed === 0) throw new AlreadyReviewedError();
    await recalculateStudentFee();
  }));
  } catch (err) {
    if (err instanceof AlreadyReviewedError) {
      return NextResponse.json({ message: "This request is already reviewed" }, { status: 409 });
    }
    throw err;
  }

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
