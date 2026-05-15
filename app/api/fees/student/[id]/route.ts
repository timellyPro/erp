import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { isOverallDiscountKey } from "@/lib/studentFeeHeadDiscount";

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
    const fee = await prisma.studentFee.findUnique({
      where: { studentId: id },
    });

    if (!fee) {
      return NextResponse.json(
        { message: "Fee details not found for this student" },
        { status: 404 }
      );
    }

    return NextResponse.json({ fee });
  } catch (error: any) {
    console.error("Get fee by student error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
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
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Fee details not found for this student" },
        { status: 404 }
      );
    }

    const body = await req.json();
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

    const discountFixedAmount =
      hasDiscount && !isOverallDiscountKey(headKey) ? discountRupee : null;

    const finalFee = Math.max(0, Math.round((newTotalFee - discountRupee) * 100) / 100);
    const remainingFee = Math.max(finalFee - existing.amountPaid, 0);

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

    return NextResponse.json({ fee: updated });
  } catch (error: any) {
    console.error("Update student fee error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

