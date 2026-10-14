import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { createNotification } from "@/lib/notificationService";
import { logger } from "@/lib/logger";
import { invalidateFeeListServerCaches } from "@/lib/fees/feeListServerCache";
import { rateLimit, rateLimitKey } from "@/lib/rateLimit";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

const verifyPaymentBodySchema = z.object({
  gateway: z.string().optional().nullable(),
  order_id: z.string().optional().nullable(),
  amount: z.union([z.number(), z.string()]).optional().nullable(),
});

const hyperpgBaseUrl = process.env.HYPERPG_BASE_URL || "https://sandbox.hyperpg.in";
const globalHyperpgMerchantId = process.env.HYPERPG_MERCHANT_ID;
const globalHyperpgApiKey = process.env.HYPERPG_API_KEY;
const hyperpgAuthStyle = process.env.HYPERPG_AUTH_STYLE || "api_key";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "STUDENT" || !session.user.studentId) {
    return NextResponse.json(
      { message: "Only students can verify their payments" },
      { status: 403 }
    );
  }

  // Higher ceiling than order creation since a client may legitimately poll
  // verify a few times while waiting on the gateway callback.
  const verifyLimit = await rateLimit(
    rateLimitKey("payment-verify", session.user.studentId),
    30,
    10 * 60
  );
  if (!verifyLimit.allowed) {
    return NextResponse.json(
      { message: `Too many requests. Please try again in ${Math.ceil(verifyLimit.resetInSeconds / 60)} minute(s).` },
      { status: 429 }
    );
  }

  try {
    const studentId = session.user.studentId;
    const rawBody = await req.json().catch(() => ({}));
    const parsedBody = verifyPaymentBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const {
      gateway: gw,
      order_id: orderId,
      amount,
    } = parsedBody.data;

    const gateway = gw || "HYPERPG";

    const amountNum = typeof amount === "string" ? parseFloat(amount) : amount;
    if (typeof amountNum !== "number" || isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { message: "Valid amount (number) required" },
        { status: 400 }
      );
    }

    if (gateway !== "HYPERPG") {
      return NextResponse.json(
        { message: "Only HyperPG payments are supported" },
        { status: 400 }
      );
    }

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json(
        { message: "Missing order_id for verification" },
        { status: 400 }
      );
    }
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });
    if (!student) {
      return NextResponse.json(
        { message: "Student not found" },
        { status: 404 }
      );
    }

    const settings = await prisma.schoolSettings.findUnique({
      where: { schoolId: student.schoolId },
    });
    const merchantId =
      settings?.hyperpgMerchantId?.trim() || globalHyperpgMerchantId?.trim();
    const apiKey =
      settings?.hyperpgApiKey?.trim() || globalHyperpgApiKey?.trim();

    if (!merchantId || !apiKey) {
      return NextResponse.json(
        { message: "Payment gateway not configured for this school" },
        { status: 500 }
      );
    }

    const apiKeyClean = apiKey.replace(/^["']|["']$/g, "").trim();
    const auth =
      hyperpgAuthStyle === "merchant_key"
        ? Buffer.from(`${merchantId}:${apiKeyClean}`).toString("base64")
        : Buffer.from(`${apiKeyClean}:`, "utf8").toString("base64");
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
      ...(merchantId && { "x-merchantid": merchantId.trim() }),
    };
    const statusRes = await fetch(
      `${hyperpgBaseUrl}/orders/${encodeURIComponent(orderId)}`,
      { method: "GET", headers }
    );

    if (!statusRes.ok) {
      const errText = await statusRes.text();
      logger.error("HyperPG order status error:", statusRes.status, errText);
      return NextResponse.json(
        { message: "Could not verify order status with payment gateway" },
        { status: 502 }
      );
    }

    const orderStatus = await statusRes.json();

    if (orderStatus.status !== "CHARGED") {
      return NextResponse.json(
        {
          message:
            orderStatus.status === "NEW"
              ? "Payment not completed yet"
              : `Payment status: ${orderStatus.status || "unknown"}`,
        },
        { status: 400 }
      );
    }

    const orderAmount = Number(orderStatus.amount);
    if (orderAmount > 0 && Math.abs(orderAmount - amountNum) > 0.01) {
      return NextResponse.json(
        { message: "Amount mismatch with order" },
        { status: 400 }
      );
    }

    const hyperpgId = orderStatus.id || null;

    // Find existing Payment by transactionId (our orderId), hyperpgOrderId, or gateway txn id
    const existing = await prisma.payment.findFirst({
      where: {
        studentId,
        OR: [
          { transactionId: orderId },
          ...(hyperpgId ? [{ hyperpgOrderId: hyperpgId }] : []),
          ...(orderStatus.txn_id ? [{ hyperpgTxnId: String(orderStatus.txn_id) }] : []),
        ],
      },
    });

    if (existing) {
      const payment = await runInTenantScope(student.schoolId, () => prisma.$transaction(async (tx) => {
        const before = await tx.payment.findUnique({
          where: { id: existing.id },
          select: { status: true, amount: true, studentId: true, eventRegistrationId: true },
        });

        const updated = await tx.payment.update({
          where: { id: existing.id },
          data: {
            status: "SUCCESS",
            hyperpgOrderId: hyperpgId || existing.hyperpgOrderId,
            hyperpgTxnId: orderStatus.txn_id || existing.hyperpgTxnId,
            hyperpgStatus: typeof orderStatus.status === "string" ? orderStatus.status : null,
            hyperpgStatusId: typeof orderStatus.status_id === "number" ? orderStatus.status_id : null,
            hyperpgRefunded: typeof orderStatus.refunded === "boolean" ? orderStatus.refunded : undefined,
            hyperpgAmountRefunded: typeof orderStatus.amount_refunded === "number" ? orderStatus.amount_refunded : undefined,
            hyperpgEffectiveAmount: typeof orderStatus.effective_amount === "number" ? orderStatus.effective_amount : undefined,
            hyperpgLastUpdatedAt: new Date(),
          },
        });

        const transitioned = before?.status !== "SUCCESS";
        if (transitioned) {
          if (before?.eventRegistrationId) {
            await tx.eventRegistration.update({
              where: { id: before.eventRegistrationId },
              data: { paymentStatus: "PAID", paymentId: updated.id },
            });
          } else {
            const fee = await tx.studentFee.findUnique({
              where: { studentId: before?.studentId ?? studentId },
              select: { amountPaid: true, finalFee: true },
            });
            if (fee) {
              const newAmountPaid = fee.amountPaid + (before?.amount ?? amountNum);
              const newRemaining = Math.max(fee.finalFee - newAmountPaid, 0);
              await tx.studentFee.update({
                where: { studentId: before?.studentId ?? studentId },
                data: { amountPaid: newAmountPaid, remainingFee: newRemaining },
              });
            }
          }
        }

        return updated;
      }));

      invalidateFeeListServerCaches(student.schoolId);

      // If workshop payment, return eventRegistration status
      if (existing.eventRegistrationId) {
        return NextResponse.json(
          { payment, eventRegistration: { paymentStatus: "PAID" } },
          { status: 200 }
        );
      }

      const fee = await prisma.studentFee.findUnique({
        where: { studentId },
      });
      const studentUser = await prisma.student.findUnique({
        where: { id: studentId },
        select: { userId: true },
      });
      if (studentUser?.userId) {
        createNotification(
          studentUser.userId,
          "FEES",
          "Payment received",
          `₹${payment.amount.toLocaleString()} payment received successfully`
        ).catch(() => {});
      }
      return NextResponse.json(
        { payment, fee: fee ?? undefined },
        { status: 200 }
      );
    }

    // No pre-created Payment (legacy fee flow). The create + fee update run in one
    // transaction, and a unique index on (transactionId) for HYPERPG payments
    // (see migration 20260927010000) backstops the check-then-act race between two
    // concurrent verify calls for the same order_id: whichever loses the race gets
    // a unique-violation instead of double-crediting the student's fee balance.
    let legacyResult: { payment: Awaited<ReturnType<typeof prisma.payment.create>>; fee: unknown; raced: boolean };
    try {
      legacyResult = await runInTenantScope(student.schoolId, () => prisma.$transaction(async (tx) => {
        const fee = await tx.studentFee.findUnique({ where: { studentId } });
        if (!fee) {
          throw new Error("__FEE_NOT_FOUND__");
        }

        const newAmountPaid = fee.amountPaid + amountNum;
        const newRemaining = Math.max(fee.finalFee - newAmountPaid, 0);

        const payment = await tx.payment.create({
          data: {
            studentId,
            amount: amountNum,
            gateway: "HYPERPG",
            transactionId: orderId,
            hyperpgOrderId: orderStatus.id || null,
            hyperpgTxnId: orderStatus.txn_id || null,
            hyperpgStatus: typeof orderStatus.status === "string" ? orderStatus.status : null,
            hyperpgStatusId: typeof orderStatus.status_id === "number" ? orderStatus.status_id : null,
            hyperpgRefunded: typeof orderStatus.refunded === "boolean" ? orderStatus.refunded : false,
            hyperpgAmountRefunded: typeof orderStatus.amount_refunded === "number" ? orderStatus.amount_refunded : 0,
            hyperpgEffectiveAmount: typeof orderStatus.effective_amount === "number" ? orderStatus.effective_amount : null,
            hyperpgLastUpdatedAt: new Date(),
            status: "SUCCESS",
          },
        });

        const updatedFee = await tx.studentFee.update({
          where: { studentId },
          data: { amountPaid: newAmountPaid, remainingFee: newRemaining },
        });

        return { payment, fee: updatedFee, raced: false };
      }));
    } catch (txError: unknown) {
      if (txError instanceof Error && txError.message === "__FEE_NOT_FOUND__") {
        return NextResponse.json(
          { message: "Fee details not found for this student" },
          { status: 404 }
        );
      }
      const isOrderIdRace =
        txError instanceof Prisma.PrismaClientKnownRequestError && txError.code === "P2002";
      if (!isOrderIdRace) throw txError;

      // The other request already created (and possibly credited) this Payment.
      // Return its current state instead of failing or crediting a second time.
      const racedPayment = await prisma.payment.findFirst({ where: { studentId, transactionId: orderId } });
      const racedFee = await prisma.studentFee.findUnique({ where: { studentId } });
      if (!racedPayment) throw txError;
      legacyResult = { payment: racedPayment, fee: racedFee, raced: true };
    }

    if (!legacyResult.raced) {
      const studentUser = await prisma.student.findUnique({
        where: { id: studentId },
        select: { userId: true },
      });
      if (studentUser?.userId) {
        createNotification(
          studentUser.userId,
          "FEES",
          "Payment received",
          `₹${amountNum.toLocaleString()} payment received successfully`
        ).catch(() => {});
      }
      invalidateFeeListServerCaches(student.schoolId);
    }

    return NextResponse.json(
      { payment: legacyResult.payment, fee: legacyResult.fee },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("Verify payment error:", error);
    return NextResponse.json(
      {
        message:
          toClientErrorMessage(error, "Internal server error"),
      },
      { status: 500 }
    );
  }
}
