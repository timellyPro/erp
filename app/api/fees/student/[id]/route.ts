import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInOptionalTenantScope, runInTenantScope } from "@/lib/db/tenantContext";
import { invalidateStudentFeeReadCaches } from "@/lib/fees/studentFeeReadCache";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

type RouteParams =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteParams) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const id = resolved.id;

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    // SUPERADMIN reads across tenants (owner connection); everyone else is RLS-scoped.
    const scopeSchoolId =
      session.user.role !== "SUPERADMIN" && typeof session.user.schoolId === "string" && session.user.schoolId.trim()
        ? session.user.schoolId
        : null;
    const fee = await runInOptionalTenantScope(scopeSchoolId, () => prisma.studentFee.findUnique({
      where: { studentId: id },
      include: {
        student: { select: { schoolId: true } },
        discountApprovals: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    }));

    if (!fee) {
      return NextResponse.json(
        { message: "Fee details not found for this student" },
        { status: 404 }
      );
    }

    const sessionSchoolId =
      typeof session.user.schoolId === "string" && session.user.schoolId.trim()
        ? session.user.schoolId
        : null;
    if (
      session.user.role !== "SUPERADMIN" &&
      sessionSchoolId &&
      sessionSchoolId !== fee.student.schoolId
    ) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ fee });
  } catch (error: unknown) {
    logger.error("Get fee by student error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, context: RouteParams) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const id = resolved.id;

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const canManageFees =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManageFees) {
    return NextResponse.json(
      { message: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const existing = await prisma.studentFee.findUnique({
      where: { studentId: id },
      include: {
        student: { select: { schoolId: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Fee details not found for this student" },
        { status: 404 }
      );
    }

    const schoolId = existing.student.schoolId;
    const sessionSchoolId =
      typeof session.user.schoolId === "string" && session.user.schoolId.trim()
        ? session.user.schoolId
        : null;
    if (session.user.role !== "SUPERADMIN" && sessionSchoolId && sessionSchoolId !== schoolId) {
      return NextResponse.json(
        { message: "Forbidden" },
        { status: 403 }
      );
    }

    // The initial lookup above is deliberately cross-tenant (it discovers the student's school).
    // Everything after the authorization check acts on that ONE school, RLS-scoped.
    return await runInTenantScope(schoolId, async () => {
    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    const body = parsedBody.success ? parsedBody.data : {};
    const {
      totalFee,
      discountPercent,
      discountFixedAmount: rawDiscountFixedAmount,
      discountFeeHeadKey,
      discountFeeHeadLabel,
      discountRemarks,
    } = body;

    let newTotalFee = typeof totalFee === "number" ? totalFee : existing.totalFee;
    let newDiscount =
      typeof discountPercent === "number" ? discountPercent : existing.discountPercent;

    if (newTotalFee <= 0) {
      return NextResponse.json(
        { message: "totalFee must be a positive number" },
        { status: 400 }
      );
    }

    if (newDiscount < 0 || newDiscount > 100) {
      return NextResponse.json(
        { message: "discountPercent must be between 0 and 100" },
        { status: 400 }
      );
    }

    const hasDiscount = newDiscount > 0;
    let headKey: string | null =
      typeof discountFeeHeadKey === "string" && discountFeeHeadKey.trim()
        ? discountFeeHeadKey.trim()
        : null;
    let headLabel: string | null =
      typeof discountFeeHeadLabel === "string" && discountFeeHeadLabel.trim()
        ? discountFeeHeadLabel.trim()
        : null;
    let remarksVal: string | null =
      typeof discountRemarks === "string" && discountRemarks.trim() ? discountRemarks.trim() : null;

    if (hasDiscount) {
      if (!headKey) {
        return NextResponse.json(
          { message: "Select the fee head this discount applies to." },
          { status: 400 }
        );
      }
      if (!remarksVal || remarksVal.length < 3) {
        return NextResponse.json(
          { message: "Enter discount remarks / approval authority (at least 3 characters)." },
          { status: 400 }
        );
      }
    } else {
      headKey = null;
      headLabel = null;
      remarksVal = null;
    }

    const discountRupee =
      hasDiscount && typeof rawDiscountFixedAmount === "number" && rawDiscountFixedAmount > 0
        ? rawDiscountFixedAmount
        : hasDiscount
          ? Math.round(newTotalFee * (newDiscount / 100) * 100) / 100
          : 0;

    const finalFee = Math.max(0, Math.round((newTotalFee - discountRupee) * 100) / 100);
    const remainingFee = Math.max(finalFee - existing.amountPaid, 0);

    if (hasDiscount) {
      const approvalData = {
        schoolId,
        studentId: id,
        studentFeeId: existing.id,
        requestedById: session.user.id,
        totalFee: newTotalFee,
        discountPercent: newDiscount,
        discountFixedAmount: discountRupee,
        finalFee,
        discountFeeHeadKey: headKey,
        discountFeeHeadLabel: headLabel,
        discountRemarks: remarksVal,
      } as const;

      const pending = await prisma.feeDiscountApproval.findFirst({
        where: {
          studentId: id,
          schoolId,
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      const approvalRequest = pending
        ? await prisma.feeDiscountApproval.update({
            where: { id: pending.id },
            data: {
              ...approvalData,
              reviewedById: null,
              reviewRemarks: null,
              reviewedAt: null,
            },
          })
        : await prisma.feeDiscountApproval.create({
            data: approvalData,
          });

      const approvalRequests = await prisma.feeDiscountApproval.findMany({
        where: { studentId: id, schoolId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          discountFixedAmount: true,
          discountFeeHeadLabel: true,
          discountRemarks: true,
          createdAt: true,
        },
      });

      return NextResponse.json({
        fee: existing,
        approvalRequest,
        approvalRequests,
        pendingApproval: true,
        message: "Discount submitted for chairman approval.",
      });
    }

    const updated = await prisma.studentFee.update({
      where: { studentId: id },
      data: {
        totalFee: newTotalFee,
        discountPercent: newDiscount,
        finalFee,
        remainingFee,
        discountFeeHeadKey: headKey,
        discountFeeHeadLabel: headLabel,
        discountRemarks: remarksVal,
      } as Parameters<(typeof prisma.studentFee)["update"]>[0]["data"],
    });

    const student = await prisma.student.findUnique({
      where: { id },
      select: { schoolId: true },
    });
    await invalidateStudentFeeReadCaches({ studentId: id, schoolId: student?.schoolId ?? null });

    return NextResponse.json({ fee: updated });
    });
  } catch (error: unknown) {
    logger.error("Update student fee error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}

