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

async function getSchoolId(session: { user: { id: string; schoolId?: string | null } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  return schoolId;
}

/**
 * POST /api/payment/refund
 * Refund a successful payment. School admin only.
 * Body: { paymentId: string, amount: number, reason?: string }
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  if (!isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await getSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const body = await req.json();
    const { paymentId, amount: rawAmount, reason } = body;

    const amount = typeof rawAmount === "string" ? parseFloat(rawAmount) : rawAmount;
    if (!paymentId || typeof amount !== "number" || isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { message: "paymentId and amount (positive number) required" },
        { status: 400 }
      );
    }

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId },
      include: {
        student: { include: { fee: true, user: { select: { id: true } } } },
      },
    });

    if (!payment) {
      return NextResponse.json({ message: "Payment not found" }, { status: 404 });
    }

    if (payment.student.schoolId !== schoolId) {
      return NextResponse.json({ message: "Payment does not belong to your school" }, { status: 403 });
    }

    if (payment.status !== "SUCCESS") {
      return NextResponse.json({ message: "Only successful payments can be refunded" }, { status: 400 });
    }

    if (payment.eventRegistrationId) {
      return NextResponse.json(
        { message: "Workshop/event payments cannot be refunded from fees" },
        { status: 400 }
      );
    }

    const refundSumRows = (await prisma.$queryRawUnsafe(
      'SELECT COALESCE(SUM(amount)::float, 0) as total FROM "Refund" WHERE "paymentId" = $1 AND status = $2',
      paymentId,
      "SUCCESS"
    )) as { total: number }[];
    const alreadyRefunded = refundSumRows[0]?.total ?? 0;
    const maxRefundable = payment.amount - alreadyRefunded;
    if (amount > maxRefundable) {
      return NextResponse.json(
        {
          message: `Refund amount exceeds max refundable. Max: ₹${maxRefundable.toLocaleString()}`,
        },
        { status: 400 }
      );
    }

    const fee = payment.student.fee;
    if (!fee) {
      return NextResponse.json({ message: "Fee record not found for this student" }, { status: 404 });
    }

    // For HyperPG payments: call gateway refund API so money is actually sent back to the customer.
    // Use transactionId (our order_id sent in session) — same as GET /orders in verify; hyperpgOrderId is gateway-internal and can cause NOT_FOUND.
    if (payment.gateway === "HYPERPG") {
      const orderIdForRefund = payment.transactionId || payment.hyperpgOrderId;
      if (!orderIdForRefund) {
        return NextResponse.json(
          { message: "Original payment has no gateway order id; cannot process online refund." },
          { status: 400 }
        );
      }

      const useGlobalOnly =
        process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "true" ||
        process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "1";
      const settings = useGlobalOnly
        ? null
        : await prisma.schoolSettings.findUnique({
            where: { schoolId: payment.student.schoolId },
            select: {
              hyperpgMerchantId: true,
              hyperpgApiKey: true,
            },
          });
      const schoolBaseUrl = useGlobalOnly
        ? null
        : await getSchoolHyperpgBaseUrlRaw(payment.student.schoolId);
      const hyperpgBaseUrl = resolveHyperpgBaseUrl({
        useGlobalOnly,
        schoolHyperpgBaseUrl: schoolBaseUrl,
      });
      const merchantId = useGlobalOnly
        ? (globalHyperpgMerchantId?.trim() ?? "")
        : (settings?.hyperpgMerchantId?.trim() || globalHyperpgMerchantId?.trim());
      const apiKey = useGlobalOnly
        ? (globalHyperpgApiKey?.trim() ?? "")
        : (settings?.hyperpgApiKey?.trim() || globalHyperpgApiKey?.trim());

      if (!merchantId || !apiKey) {
        return NextResponse.json(
          { message: "Payment gateway not configured for this school. Add HyperPG credentials in Settings." },
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

      const uniqueRequestId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`.slice(0, 20);
      const body = new URLSearchParams({
        unique_request_id: uniqueRequestId,
        amount: String(amount),
      });
      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
        "User-Agent": "Timelly-ERP/1.0 (HyperPG refund)",
        "x-routing-id": payment.studentId.slice(0, 128),
        ...(merchantIdClean ? { "x-merchantid": merchantIdClean } : {}),
      };

      const refundRes = await fetch(
        `${hyperpgBaseUrl}/orders/${encodeURIComponent(orderIdForRefund)}/refunds`,
        { method: "POST", headers, body: body.toString() }
      );
      const refundResText = await refundRes.text();

      if (!refundRes.ok) {
        let errMsg = "Refund request to payment gateway failed.";
        try {
          const errJson = JSON.parse(refundResText) as { error_message?: string; error_code?: string };
          if (errJson?.error_message) errMsg = errJson.error_message;
          else if (errJson?.error_code) errMsg = errJson.error_code;
        } catch (_) {
          if (refundResText.length < 200) errMsg = refundResText;
        }
        console.error("HyperPG refund error:", refundRes.status, refundResText);
        return NextResponse.json(
          { message: errMsg },
          { status: 400 }
        );
      }

      let refundPayload: { status?: string; refunds?: Array<{ status?: string }> } = {};
      try {
        refundPayload = JSON.parse(refundResText);
      } catch (_) {}
      const refundStatus = refundPayload.refunds?.[0]?.status ?? refundPayload.status;
      if (refundStatus && refundStatus !== "PENDING" && refundStatus !== "SUCCESS") {
        return NextResponse.json(
          { message: `Gateway refund status: ${refundStatus}. Please check with payment gateway.` },
          { status: 400 }
        );
      }
    }

    // OFFLINE payments: no gateway call, only DB update
    const newAmountPaid = Math.max(fee.amountPaid - amount, 0);
    const newRemaining = Math.max(fee.finalFee - newAmountPaid, 0);

    const reasonVal = typeof reason === "string" ? reason : null;
    const refundId = crypto.randomUUID();

    // If this payment has per-head allocations, create matching REFUND allocations.
    // This lets due-by-head calculations increase due for the same heads proportionally.
    const originalAllocations = await prisma.paymentFeeAllocation.findMany({
      where: { paymentId, allocationType: "PAYMENT" },
      select: {
        headType: true,
        componentIndex: true,
        componentName: true,
        extraFeeId: true,
        allocatedAmount: true,
      },
    });

    const scale = payment.amount > 0 ? amount / payment.amount : 0;
    const refundAllocationsToCreate =
      originalAllocations.length > 0 && scale > 0
        ? (() => {
            const scaled = originalAllocations.map((a) => ({
              headType: a.headType,
              componentIndex: a.componentIndex,
              componentName: a.componentName,
              extraFeeId: a.extraFeeId,
              allocatedAmount: a.allocatedAmount * scale,
            }));

            const scaledTotal = scaled.reduce((s, a) => s + a.allocatedAmount, 0);
            const diff = amount - scaledTotal;
            if (Math.abs(diff) > 0.00001 && scaled.length > 0) {
              scaled[scaled.length - 1] = { ...scaled[scaled.length - 1], allocatedAmount: scaled[scaled.length - 1].allocatedAmount + diff };
            }

            return scaled.map((a) => ({
              paymentId,
              studentId: payment.studentId,
              allocationType: "REFUND",
              allocatedAmount: Math.max(a.allocatedAmount, 0),
              headType: a.headType,
              componentIndex: a.componentIndex,
              componentName: a.componentName,
              extraFeeId: a.extraFeeId,
            }));
          })()
        : [];

    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        'INSERT INTO "Refund" (id, "paymentId", amount, reason, status, "createdAt") VALUES ($1, $2, $3, $4, $5, NOW())',
        refundId,
        paymentId,
        amount,
        reasonVal,
        "SUCCESS"
      ),
      ...(refundAllocationsToCreate.length > 0
        ? [
            prisma.paymentFeeAllocation.createMany({
              data: refundAllocationsToCreate,
            }),
          ]
        : []),
      prisma.studentFee.update({
        where: { studentId: payment.studentId },
        data: { amountPaid: newAmountPaid, remainingFee: newRemaining },
      }),
    ]);

    const refund = { id: refundId, paymentId, amount, reason: reasonVal, status: "SUCCESS" };

    const userId = payment.student.user?.id;
    if (userId) {
      createNotification(
        userId,
        "FEES",
        "Refund processed",
        `₹${amount.toLocaleString()} refunded for your fee payment`
      ).catch(() => {});
    }

    const message =
      payment.gateway === "HYPERPG"
        ? "Refund initiated with payment gateway; amount will be credited back to the customer. Fee record updated."
        : "Refund processed successfully (offline payment).";

    return NextResponse.json(
      { refund, message },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Refund error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
