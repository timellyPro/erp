import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { createNotification } from "@/lib/notificationService";
import { logger } from "@/lib/logger";
import { invalidateFeeListServerCaches } from "@/lib/fees/feeListServerCache";
import { FEE_MUTATION_TX } from "@/lib/fees/prismaFeeMutationTx";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/** Thrown from inside the locked transaction to map back to a 4xx response, not a 500. */
class RefundRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const hyperpgBaseUrl = process.env.HYPERPG_BASE_URL || "https://sandbox.hyperpg.in";
const globalHyperpgMerchantId = process.env.HYPERPG_MERCHANT_ID;
const globalHyperpgApiKey = process.env.HYPERPG_API_KEY;
const hyperpgAuthStyle = process.env.HYPERPG_AUTH_STYLE || "api_key";

const refundBodySchema = z.object({
  paymentId: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  reason: z.string().optional().nullable(),
});

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

    const rawBody = await req.json().catch(() => null);
    const parsedBody = refundBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: "paymentId and amount (positive number) required" },
        { status: 400 }
      );
    }
    const { paymentId, amount: rawAmount, reason } = parsedBody.data;

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

    const fee = payment.student.fee;
    if (!fee) {
      return NextResponse.json({ message: "Fee record not found for this student" }, { status: 404 });
    }

    const reasonVal = typeof reason === "string" ? reason : null;
    const refundId = crypto.randomUUID();

    // Everything from here on — the refundable-amount check, the outbound gateway
    // refund call, and the DB writes — runs under one Postgres advisory lock keyed
    // to this paymentId (held for the transaction's lifetime). Without it, two
    // concurrent refund requests for the same payment could both read the same
    // "already refunded" total, both pass the cap check, and both proceed: for
    // HyperPG payments that means two real gateway refund calls before either DB
    // write lands, and either way the student could be refunded more than they
    // paid. The lock serializes the second request behind the first instead.
    await runInTenantScope(payment.student.schoolId, () => prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', paymentId);

      const refundSumRows = (await tx.$queryRawUnsafe(
        'SELECT COALESCE(SUM(amount)::float, 0) as total FROM "Refund" WHERE "paymentId" = $1 AND status = $2',
        paymentId,
        "SUCCESS"
      )) as { total: number }[];
      const alreadyRefunded = refundSumRows[0]?.total ?? 0;
      const maxRefundable = payment.amount - alreadyRefunded;
      if (amount > maxRefundable) {
        throw new RefundRequestError(
          `Refund amount exceeds max refundable. Max: ₹${maxRefundable.toLocaleString()}`,
          400
        );
      }

      // For HyperPG payments: call gateway refund API so money is actually sent back to the customer.
      // Use transactionId (our order_id sent in session) — same as GET /orders in verify; hyperpgOrderId is gateway-internal and can cause NOT_FOUND.
      if (payment.gateway === "HYPERPG") {
        const orderIdForRefund = payment.transactionId || payment.hyperpgOrderId;
        if (!orderIdForRefund) {
          throw new RefundRequestError(
            "Original payment has no gateway order id; cannot process online refund.",
            400
          );
        }

        const useGlobalOnly =
          process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "true" ||
          process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "1";
        const settings = useGlobalOnly
          ? null
          : await tx.schoolSettings.findUnique({
              where: { schoolId: payment.student.schoolId },
            });
        const merchantId = useGlobalOnly
          ? (globalHyperpgMerchantId?.trim() ?? "")
          : (settings?.hyperpgMerchantId?.trim() || globalHyperpgMerchantId?.trim());
        const apiKey = useGlobalOnly
          ? (globalHyperpgApiKey?.trim() ?? "")
          : (settings?.hyperpgApiKey?.trim() || globalHyperpgApiKey?.trim());

        if (!merchantId || !apiKey) {
          throw new RefundRequestError(
            "Payment gateway not configured for this school. Add HyperPG credentials in Settings.",
            500
          );
        }

        const apiKeyClean = apiKey.replace(/^["']|["']$/g, "").trim();
        const merchantIdClean = (merchantId || "").trim().replace(/^["']|["']$/g, "");
        const auth =
          hyperpgAuthStyle === "merchant_key" && merchantIdClean
            ? Buffer.from(`${merchantIdClean}:${apiKeyClean}`).toString("base64")
            : Buffer.from(`${apiKeyClean}:`, "utf8").toString("base64");

        const uniqueRequestId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`.slice(0, 20);
        const gatewayBody = new URLSearchParams({
          unique_request_id: uniqueRequestId,
          amount: String(amount),
        });
        const headers: Record<string, string> = {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${auth}`,
          "x-routing-id": payment.studentId.slice(0, 128),
          ...(merchantIdClean && { "x-merchantid": merchantIdClean }),
        };

        const refundRes = await fetch(
          `${hyperpgBaseUrl}/orders/${encodeURIComponent(orderIdForRefund)}/refunds`,
          { method: "POST", headers, body: gatewayBody.toString() }
        );
        const refundResText = await refundRes.text();

        if (!refundRes.ok) {
          let errMsg = "Refund request to payment gateway failed.";
          try {
            const errJson = JSON.parse(refundResText) as { error_message?: string; error_code?: string };
            if (errJson?.error_message) errMsg = errJson.error_message;
            else if (errJson?.error_code) errMsg = errJson.error_code;
          } catch {
            if (refundResText.length < 200) errMsg = refundResText;
          }
          logger.error("HyperPG refund error:", refundRes.status, refundResText);
          throw new RefundRequestError(errMsg, 400);
        }

        let refundPayload: { status?: string; refunds?: Array<{ status?: string }> } = {};
        try {
          refundPayload = JSON.parse(refundResText);
        } catch {}
        const refundStatus = refundPayload.refunds?.[0]?.status ?? refundPayload.status;
        if (refundStatus && refundStatus !== "PENDING" && refundStatus !== "SUCCESS") {
          throw new RefundRequestError(
            `Gateway refund status: ${refundStatus}. Please check with payment gateway.`,
            400
          );
        }
      }

      // OFFLINE payments: no gateway call, only DB update
      const newAmountPaid = Math.max(fee.amountPaid - amount, 0);
      const newRemaining = Math.max(fee.finalFee - newAmountPaid, 0);

      // If this payment has per-head allocations, create matching REFUND allocations.
      // This lets due-by-head calculations increase due for the same heads proportionally.
      const originalAllocations = await tx.paymentFeeAllocation.findMany({
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

      await tx.$executeRawUnsafe(
        'INSERT INTO "Refund" (id, "paymentId", amount, reason, status, "createdAt") VALUES ($1, $2, $3, $4, $5, NOW())',
        refundId,
        paymentId,
        amount,
        reasonVal,
        "SUCCESS"
      );
      if (refundAllocationsToCreate.length > 0) {
        await tx.paymentFeeAllocation.createMany({ data: refundAllocationsToCreate });
      }
      await tx.studentFee.update({
        where: { studentId: payment.studentId },
        data: { amountPaid: newAmountPaid, remainingFee: newRemaining },
      });
    }, FEE_MUTATION_TX));

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

    invalidateFeeListServerCaches(schoolId);

    return NextResponse.json(
      { refund, message },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof RefundRequestError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    logger.error("Refund error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
