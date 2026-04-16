import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";

type RouteParams = { params: Promise<{ id: string }> };

function isFeePayment(p: { purpose: string; eventRegistrationId: string | null }) {
  return !p.eventRegistrationId && (p.purpose === "FEES" || !p.purpose);
}

async function loadAuthorizedPayment(paymentId: string, schoolId: string) {
  return prisma.payment.findFirst({
    where: { id: paymentId, student: { schoolId } },
    include: {
      student: {
        include: { fee: true },
      },
    },
  });
}

/**
 * PATCH /api/fees/payment/:id
 * School admin / teacher: correct amount (SUCCESS fee payments only), reference, gateway, or recorded date.
 */
export async function PATCH(req: Request, context: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const canManage =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManage) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { id: paymentId } = await context.params;
    if (!paymentId?.trim()) {
      return NextResponse.json({ message: "Invalid payment id" }, { status: 400 });
    }

    const payment = await loadAuthorizedPayment(paymentId, schoolId);
    if (!payment) {
      return NextResponse.json({ message: "Payment not found" }, { status: 404 });
    }

    if (!isFeePayment(payment)) {
      return NextResponse.json(
        { message: "Only school fee payments can be edited here" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawAmount = body.amount;
    const transactionId =
      body.transactionId === undefined ? undefined : body.transactionId === null ? null : String(body.transactionId).trim() || null;
    const gateway = typeof body.gateway === "string" ? body.gateway.trim() : undefined;
    const createdAtRaw = typeof body.createdAt === "string" ? body.createdAt.trim() : undefined;

    const hasAmount = rawAmount !== undefined && rawAmount !== null && rawAmount !== "";
    const hasTxn = transactionId !== undefined;
    const hasGateway = gateway !== undefined && gateway.length > 0;
    const hasCreated = !!createdAtRaw;

    if (!hasAmount && !hasTxn && !hasGateway && !hasCreated) {
      return NextResponse.json(
        { message: "Provide at least one of: amount, transactionId, gateway, createdAt" },
        { status: 400 }
      );
    }

    let newCreatedAt: Date | undefined;
    if (hasCreated) {
      const d = new Date(createdAtRaw!);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ message: "Invalid createdAt" }, { status: 400 });
      }
      newCreatedAt = d;
    }

    const subCount = await prisma.parentSubscription.count({
      where: { paymentId: payment.id },
    });
    if (subCount > 0) {
      return NextResponse.json(
        { message: "This payment is linked to a subscription and cannot be edited" },
        { status: 400 }
      );
    }

    const refundCount = await prisma.refund.count({
      where: { paymentId: payment.id, status: "SUCCESS" },
    });
    if (refundCount > 0) {
      return NextResponse.json(
        { message: "Payment has refunds recorded; edit is not allowed" },
        { status: 400 }
      );
    }

    const fee = payment.student.fee;
    let newAmount = payment.amount;

    if (hasAmount) {
      const pst = String(payment.status || "").toUpperCase();
      if (pst !== "SUCCESS" && pst !== "COMPLETED") {
        return NextResponse.json(
          { message: "Amount can only be changed for successful fee payments" },
          { status: 400 }
        );
      }
      if (!fee) {
        return NextResponse.json({ message: "Student has no fee record" }, { status: 400 });
      }
      const parsed =
        typeof rawAmount === "number" ? rawAmount : parseFloat(String(rawAmount).trim());
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json({ message: "amount must be a positive number" }, { status: 400 });
      }
      newAmount = Math.round(parsed * 100) / 100;
      const delta = newAmount - payment.amount;
      const newAmountPaid = Math.round((fee.amountPaid + delta) * 100) / 100;
      if (newAmountPaid < -0.0001) {
        return NextResponse.json(
          { message: "Change would make total paid negative" },
          { status: 400 }
        );
      }
      const newRemaining = Math.max(0, Math.round((fee.finalFee - newAmountPaid) * 100) / 100);

      await prisma.$transaction(async (tx) => {
        const payAllocations = await tx.paymentFeeAllocation.findMany({
          where: { paymentId: payment.id, allocationType: "PAYMENT" },
          select: {
            id: true,
            allocatedAmount: true,
            headType: true,
            componentIndex: true,
            componentName: true,
            extraFeeId: true,
          },
        });

        if (payAllocations.length > 0 && Math.abs(delta) > 0.00001) {
          const oldTotal = payAllocations.reduce((s, a) => s + a.allocatedAmount, 0);
          if (oldTotal > 0.00001) {
            const scale = newAmount / oldTotal;
            const scaled = payAllocations.map((a) => ({
              id: a.id,
              allocatedAmount: Math.max(0, Math.round(a.allocatedAmount * scale * 100) / 100),
            }));
            let scaledSum = scaled.reduce((s, a) => s + a.allocatedAmount, 0);
            let diff = newAmount - scaledSum;
            if (Math.abs(diff) > 0.00001 && scaled.length > 0) {
              const last = scaled[scaled.length - 1]!;
              last.allocatedAmount = Math.max(0, Math.round((last.allocatedAmount + diff) * 100) / 100);
            }
            for (const row of scaled) {
              await tx.paymentFeeAllocation.update({
                where: { id: row.id },
                data: { allocatedAmount: row.allocatedAmount },
              });
            }
          }
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            amount: newAmount,
            ...(hasTxn ? { transactionId } : {}),
            ...(hasGateway ? { gateway } : {}),
            ...(newCreatedAt ? { createdAt: newCreatedAt } : {}),
          },
        });

        await tx.studentFee.update({
          where: { studentId: payment.studentId },
          data: {
            amountPaid: Math.max(0, newAmountPaid),
            remainingFee: newRemaining,
          },
        });
      });

      const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
      return NextResponse.json({ payment: updated, message: "Payment updated" }, { status: 200 });
    }

    // No amount change — metadata only
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        ...(hasTxn ? { transactionId } : {}),
        ...(hasGateway ? { gateway } : {}),
        ...(newCreatedAt ? { createdAt: newCreatedAt } : {}),
      },
    });
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    return NextResponse.json({ payment: updated, message: "Payment updated" }, { status: 200 });
  } catch (error: unknown) {
    console.error("PATCH /api/fees/payment/[id] error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/fees/payment/:id
 * Removes a fee payment row and reverses its effect on StudentFee when it was successful.
 */
export async function DELETE(_req: Request, context: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const canManage =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManage) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { id: paymentId } = await context.params;
    if (!paymentId?.trim()) {
      return NextResponse.json({ message: "Invalid payment id" }, { status: 400 });
    }

    const payment = await loadAuthorizedPayment(paymentId, schoolId);
    if (!payment) {
      return NextResponse.json({ message: "Payment not found" }, { status: 404 });
    }

    if (!isFeePayment(payment)) {
      return NextResponse.json(
        { message: "Only school fee payments can be deleted here" },
        { status: 400 }
      );
    }

    const subCount = await prisma.parentSubscription.count({
      where: { paymentId: payment.id },
    });
    if (subCount > 0) {
      return NextResponse.json(
        { message: "This payment is linked to a subscription and cannot be deleted" },
        { status: 400 }
      );
    }

    const refundCount = await prisma.refund.count({
      where: { paymentId: payment.id, status: "SUCCESS" },
    });
    if (refundCount > 0) {
      return NextResponse.json(
        { message: "Delete blocked: this payment has refund records. Use the refund flow instead." },
        { status: 400 }
      );
    }

    const fee = payment.student.fee;
    const st = String(payment.status || "").toUpperCase();
    const shouldReverseFee = fee && (st === "SUCCESS" || st === "COMPLETED");

    await prisma.$transaction(async (tx) => {
      await tx.feeInstallment.updateMany({
        where: { paymentId: payment.id },
        data: { paymentId: null },
      });

      if (shouldReverseFee) {
        const newPaid = Math.max(0, Math.round((fee!.amountPaid - payment.amount) * 100) / 100);
        const newRemaining = Math.max(0, Math.round((fee!.finalFee - newPaid) * 100) / 100);
        await tx.studentFee.update({
          where: { studentId: payment.studentId },
          data: { amountPaid: newPaid, remainingFee: newRemaining },
        });
      }

      await tx.payment.delete({ where: { id: payment.id } });
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("DELETE /api/fees/payment/[id] error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
