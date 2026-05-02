import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notificationService";
import { resolveHyperpgBaseUrl } from "@/lib/hyperpgConfig";
import { hyperpgBasicAuthBase64 } from "@/lib/hyperpgAuth";
import { getSchoolHyperpgBaseUrlRaw } from "@/lib/schoolHyperpgBaseUrlRaw";

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

  try {
    const studentId = session.user.studentId;
    const body = await req.json();
    const {
      gateway: gw,
      order_id: orderId,
      amount,
    } = body;

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

    const useGlobalOnly =
      process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "true" ||
      process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "1";
    const settings = useGlobalOnly
      ? null
      : await prisma.schoolSettings.findUnique({
          where: { schoolId: student.schoolId },
          select: {
            hyperpgMerchantId: true,
            hyperpgApiKey: true,
          },
        });
    const schoolBaseUrl = useGlobalOnly ? null : await getSchoolHyperpgBaseUrlRaw(student.schoolId);
    const merchantId = useGlobalOnly
      ? (globalHyperpgMerchantId?.trim() ?? "")
      : (settings?.hyperpgMerchantId?.trim() || globalHyperpgMerchantId?.trim());
    const apiKey = useGlobalOnly
      ? (globalHyperpgApiKey?.trim() ?? "")
      : (settings?.hyperpgApiKey?.trim() || globalHyperpgApiKey?.trim());

    const hyperpgBaseUrl = resolveHyperpgBaseUrl({
      useGlobalOnly,
      schoolHyperpgBaseUrl: schoolBaseUrl,
    });

    if (!merchantId || !apiKey) {
      return NextResponse.json(
        { message: "Payment gateway not configured for this school" },
        { status: 500 }
      );
    }

    const apiKeyClean = apiKey.replace(/^["']|["']$/g, "").trim();
    const merchantIdClean = (merchantId || "").trim().replace(/^["']|["']$/g, "");
    const auth = hyperpgBasicAuthBase64({
      apiKeyClean,
      merchantIdClean,
      authStyle: hyperpgAuthStyle,
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
      "User-Agent": "Timelly-ERP/1.0 (HyperPG order status)",
      ...(merchantIdClean ? { "x-merchantid": merchantIdClean } : {}),
    };
    const statusRes = await fetch(
      `${hyperpgBaseUrl}/orders/${encodeURIComponent(orderId)}`,
      { method: "GET", headers }
    );

    if (!statusRes.ok) {
      const errText = await statusRes.text();
      console.error("HyperPG order status error:", statusRes.status, errText);
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

    // Find existing Payment by transactionId (our orderId) or hyperpgOrderId
    const existing = await prisma.payment.findFirst({
      where: {
        studentId,
        OR: [
          { transactionId: orderId },
          ...(hyperpgId ? [{ hyperpgOrderId: hyperpgId }] : []),
        ],
      },
    });

    if (existing) {
      const payment = await prisma.$transaction(async (tx) => {
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
      });

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

    // No pre-created Payment (legacy fee flow)
    const fee = await prisma.studentFee.findUnique({
      where: { studentId },
    });

    if (!fee) {
      return NextResponse.json(
        { message: "Fee details not found for this student" },
        { status: 404 }
      );
    }

    const newAmountPaid = fee.amountPaid + amountNum;
    const newRemaining = Math.max(fee.finalFee - newAmountPaid, 0);

    const payment = await prisma.payment.create({
      data: {
        studentId,
        amount: amountNum,
        gateway: "HYPERPG",
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

    const updatedFee = await prisma.studentFee.update({
      where: { studentId },
      data: {
        amountPaid: newAmountPaid,
        remainingFee: newRemaining,
      },
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
        `₹${amountNum.toLocaleString()} payment received successfully`
      ).catch(() => {});
    }

    return NextResponse.json(
      { payment, fee: updatedFee },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Verify payment error:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
