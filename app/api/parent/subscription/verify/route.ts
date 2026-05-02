import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveHyperpgBaseUrl } from "@/lib/hyperpgConfig";
import { hyperpgBasicAuthBase64 } from "@/lib/hyperpgAuth";
import { getSchoolHyperpgBaseUrlRaw } from "@/lib/schoolHyperpgBaseUrlRaw";

const globalHyperpgMerchantId = process.env.HYPERPG_MERCHANT_ID;
const globalHyperpgApiKey = process.env.HYPERPG_API_KEY;
const hyperpgAuthStyle = process.env.HYPERPG_AUTH_STYLE || "api_key";

const SUBSCRIPTION_DAYS = Number(process.env.PARENT_SUBSCRIPTION_DAYS || "30");

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "STUDENT" || !session.user.studentId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    const amount = typeof body.amount === "number" ? body.amount : NaN;

    if (!orderId) {
      return NextResponse.json({ message: "Missing order_id" }, { status: 400 });
    }
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return NextResponse.json({ message: "Invalid amount" }, { status: 400 });
    }

    const studentId = session.user.studentId;
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });
    if (!student) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    const useGlobalOnly =
      process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "true" ||
      process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "1";
    const schoolSettings = useGlobalOnly
      ? null
      : await prisma.schoolSettings.findUnique({
          where: { schoolId: student.schoolId },
          select: {
            hyperpgMerchantId: true,
            hyperpgApiKey: true,
          },
        });

    const schoolBaseUrl = useGlobalOnly ? null : await getSchoolHyperpgBaseUrlRaw(student.schoolId);

    const hyperpgBaseUrl = resolveHyperpgBaseUrl({
      useGlobalOnly,
      schoolHyperpgBaseUrl: schoolBaseUrl,
    });

    const merchantId = useGlobalOnly
      ? (globalHyperpgMerchantId?.trim() ?? "")
      : (schoolSettings?.hyperpgMerchantId?.trim() || globalHyperpgMerchantId?.trim() || "");
    const apiKey = useGlobalOnly
      ? (globalHyperpgApiKey?.trim() ?? "")
      : (schoolSettings?.hyperpgApiKey?.trim() || globalHyperpgApiKey?.trim() || "");

    if (!merchantId || !apiKey) {
      return NextResponse.json(
        { message: "Payment gateway not configured for this school" },
        { status: 500 }
      );
    }

    const apiKeyClean = apiKey.replace(/^["']|["']$/g, "").trim();
    const merchantIdClean = merchantId.replace(/^["']|["']$/g, "").trim();
    const auth = hyperpgBasicAuthBase64({
      apiKeyClean,
      merchantIdClean,
      authStyle: hyperpgAuthStyle,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
      "User-Agent": "Timelly-ERP/1.0 (HyperPG subscription status)",
      ...(merchantIdClean ? { "x-merchantid": merchantIdClean } : {}),
    };

    const statusRes = await fetch(
      `${hyperpgBaseUrl}/orders/${encodeURIComponent(orderId)}`,
      { method: "GET", headers }
    );

    if (!statusRes.ok) {
      const errText = await statusRes.text();
      console.error("HyperPG subscription status error:", statusRes.status, errText);
      return NextResponse.json(
        { message: "Could not verify subscription order with payment gateway" },
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
    if (orderAmount > 0 && Math.abs(orderAmount - amount) > 0.01) {
      return NextResponse.json(
        { message: "Amount mismatch with order" },
        { status: 400 }
      );
    }

    // Find existing payment with this order id
    let payment = await prisma.payment.findFirst({
      where: {
        studentId,
        transactionId: orderId,
        purpose: "PARENT_SUBSCRIPTION",
      },
    });

    if (payment) {
      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCESS",
          hyperpgOrderId: orderStatus.id || payment.hyperpgOrderId,
          hyperpgTxnId: orderStatus.txn_id || payment.hyperpgTxnId,
        },
      });
    } else {
      payment = await prisma.payment.create({
        data: {
          studentId,
          amount,
          gateway: "HYPERPG",
          hyperpgOrderId: orderStatus.id || null,
          hyperpgTxnId: orderStatus.txn_id || null,
          status: "SUCCESS",
          purpose: "PARENT_SUBSCRIPTION",
          transactionId: orderId,
        },
      });
    }

    const now = new Date();
    const days = SUBSCRIPTION_DAYS > 0 ? SUBSCRIPTION_DAYS : 30;
    const existingActive = await prisma.parentSubscription.findFirst({
      where: {
        studentId,
        status: "ACTIVE",
      },
      orderBy: { currentPeriodEnd: "desc" },
    });

    let newEnd: Date;
    if (existingActive && existingActive.currentPeriodEnd > now) {
      newEnd = new Date(existingActive.currentPeriodEnd.getTime() + days * 24 * 60 * 60 * 1000);
    } else {
      newEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    }

    const subscription = await prisma.parentSubscription.upsert({
      where: {
        // one active record per student; fallback to create when none
        id: existingActive?.id ?? "",
      },
      create: {
        studentId,
        schoolId: student.schoolId,
        status: "ACTIVE",
        isTrial: false,
        startedAt: now,
        trialEndsAt: existingActive?.trialEndsAt ?? null,
        currentPeriodEnd: newEnd,
        amount,
        currency: "INR",
        paymentId: payment.id,
        invoiceUrl: null,
      },
      update: {
        status: "ACTIVE",
        isTrial: false,
        currentPeriodEnd: newEnd,
        amount,
        paymentId: payment.id,
      },
    });

    return NextResponse.json(
      { payment, subscription },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Verify parent subscription error:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

