import { NextResponse } from "next/server";
import crypto from "crypto";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import type { Prisma } from "@prisma/client";
import { invalidateFeeListServerCaches } from "@/lib/fees/feeListServerCache";

export const runtime = "nodejs";

type JuspayWebhookPayload = {
  id?: string;
  event_name?: string;
  date_created?: string;
  content?: {
    order?: Record<string, unknown>;
  };
};

function timingSafeEqualStr(a: string, b: string) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function unauthorized(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

function deriveInternalPaymentStatus(hyperpgStatus: string | null | undefined) {
  const s = (hyperpgStatus || "").toUpperCase();
  if (s === "CHARGED") return "SUCCESS";
  // From your PDF annexure (plus common gateway states)
  const failed = new Set([
    "AUTHENTICATION_FAILED",
    "AUTHORIZATION_FAILED",
    "JUSPAY_DECLINED",
    "CAPTURE_FAILED",
    "VOID_FAILED",
    "NOT_FOUND",
    "FAILURE",
    "FAILED",
  ]);
  const pending = new Set([
    "NEW",
    "STARTED",
    "PENDING_VBV",
    "AUTHORIZING",
    "CAPTURE_INITIATED",
    "VOID_INITIATED",
  ]);
  if (failed.has(s)) return "FAILED";
  if (pending.has(s)) return "PENDING";
  // Safe default: don't mark success unless we are sure
  return "PENDING";
}

/**
 * POST /api/payment/webhook
 *
 * HyperPG/Juspay webhooks use Basic Auth (username/password) as per docs:
 * - https://juspay.io/sea/docs/resources-global/docs/common-resources/webhooks
 *
 * Configure:
 * - HYPERPG_WEBHOOK_USERNAME
 * - HYPERPG_WEBHOOK_PASSWORD
 * Optional extra auth:
 * - HYPERPG_WEBHOOK_HEADER_NAME
 * - HYPERPG_WEBHOOK_HEADER_VALUE
 */
export async function POST(req: Request) {
  const expectedUser = process.env.HYPERPG_WEBHOOK_USERNAME?.trim() || "";
  const expectedPass = process.env.HYPERPG_WEBHOOK_PASSWORD?.trim() || "";

  // Optional extra header auth (Juspay dashboard "Custom Headers")
  const extraHeaderName = process.env.HYPERPG_WEBHOOK_HEADER_NAME?.trim() || "";
  const extraHeaderValue = process.env.HYPERPG_WEBHOOK_HEADER_VALUE?.trim() || "";

  // Fail closed: credentials must be configured, or every request is rejected.
  // (Previously this check was skipped entirely when the env vars were unset,
  // which would silently accept unauthenticated webhook calls if the
  // deployment ever lost HYPERPG_WEBHOOK_USERNAME/PASSWORD.)
  if (!expectedUser || !expectedPass) {
    return unauthorized("Webhook credentials are not configured");
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("basic ")) {
    return unauthorized("Missing Basic Authorization header");
  }
  const b64 = auth.slice(6).trim();
  let decoded = "";
  try {
    decoded = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return unauthorized("Invalid Basic Authorization header");
  }
  const idx = decoded.indexOf(":");
  const user = idx >= 0 ? decoded.slice(0, idx) : decoded;
  const pass = idx >= 0 ? decoded.slice(idx + 1) : "";
  if (!timingSafeEqualStr(user, expectedUser) || !timingSafeEqualStr(pass, expectedPass)) {
    return unauthorized("Invalid webhook credentials");
  }

  if (extraHeaderName && extraHeaderValue) {
    const got = req.headers.get(extraHeaderName);
    if (!got || !timingSafeEqualStr(got, extraHeaderValue)) {
      return unauthorized(`Missing/invalid ${extraHeaderName} header`);
    }
  }

  const rawBody = await req.text();
  let payload: JuspayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as JuspayWebhookPayload;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const eventId = typeof payload.id === "string" ? payload.id : null;
  const eventName = typeof payload.event_name === "string" ? payload.event_name : null;
  const order = payload.content?.order && typeof payload.content.order === "object" ? payload.content.order : null;

  // Always return 200 for unknown/irrelevant events (to prevent retries forever),
  // but store the event for audit when possible.
  if (!eventId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "Missing event id" }, { status: 200 });
  }

  const orderId = order && typeof order.order_id === "string" ? order.order_id : null;
  const hyperpgOrderId = order && typeof order.id === "string" ? order.id : null;
  const hyperpgStatus = order && typeof order.status === "string" ? order.status : null;
  const hyperpgStatusId = order && typeof order.status_id === "number" ? order.status_id : null;
  const hyperpgTxnId = order && typeof order.txn_id === "string" ? order.txn_id : null;
  const hyperpgRefunded = order && typeof order.refunded === "boolean" ? order.refunded : null;
  const hyperpgAmountRefunded = order && typeof order.amount_refunded === "number" ? order.amount_refunded : null;
  const hyperpgEffectiveAmount = order && typeof order.effective_amount === "number" ? order.effective_amount : null;

  try {
    // Idempotency: if we've already stored this event id, just ack it.
    await prisma.paymentWebhookEvent.create({
      data: {
        id: eventId,
        eventName: eventName ?? undefined,
        orderId: orderId ?? undefined,
        hyperpgOrderId: hyperpgOrderId ?? undefined,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Prisma unique violation or table not migrated yet — either way, ack.
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  if (!orderId && !hyperpgOrderId) {
    return NextResponse.json({ ok: true, stored: true, updated: false, reason: "No order identifiers" }, { status: 200 });
  }

  const internalStatus = deriveInternalPaymentStatus(hyperpgStatus);

  // Update Payment row if we can find it.
  // We prefer matching by our `transactionId` (HyperPG order_id) first.
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        ...(orderId ? [{ transactionId: orderId }, { hyperpgOrderId: orderId }] : []),
        ...(hyperpgOrderId ? [{ hyperpgOrderId }] : []),
      ],
    },
    select: {
      id: true,
      studentId: true,
      status: true,
      amount: true,
      eventRegistrationId: true,
      student: { select: { schoolId: true } },
    },
  });

  if (!payment) {
    // Order may not exist in our DB (or came from a different system). Ack anyway.
    return NextResponse.json({ ok: true, stored: true, updated: false, reason: "Payment not found" }, { status: 200 });
  }

  // Apply updates and side-effects only on status transition.
  await runInTenantScope(payment.student.schoolId, () => prisma.$transaction(async (tx) => {
    const before = await tx.payment.findUnique({
      where: { id: payment.id },
      select: { status: true },
    });

    const nextStatus = internalStatus as "PENDING" | "SUCCESS" | "FAILED";
    const isTransitionToSuccess = before?.status !== "SUCCESS" && nextStatus === "SUCCESS";
    const isTransitionToFailed = before?.status !== "FAILED" && nextStatus === "FAILED";

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: nextStatus,
        hyperpgOrderId: hyperpgOrderId ?? undefined,
        hyperpgTxnId: hyperpgTxnId ?? undefined,
        hyperpgStatus: hyperpgStatus ?? undefined,
        hyperpgStatusId: hyperpgStatusId ?? undefined,
        ...(hyperpgRefunded !== null ? { hyperpgRefunded } : {}),
        ...(hyperpgAmountRefunded !== null ? { hyperpgAmountRefunded } : {}),
        ...(hyperpgEffectiveAmount !== null ? { hyperpgEffectiveAmount } : {}),
        hyperpgLastUpdatedAt: new Date(),
      },
    });

    if (isTransitionToSuccess) {
      if (payment.eventRegistrationId) {
        await tx.eventRegistration.update({
          where: { id: payment.eventRegistrationId },
          data: { paymentStatus: "PAID", paymentId: payment.id },
        });
      } else {
        const fee = await tx.studentFee.findUnique({
          where: { studentId: payment.studentId },
          select: { amountPaid: true, finalFee: true },
        });
        if (fee) {
          const newAmountPaid = fee.amountPaid + payment.amount;
          const newRemaining = Math.max(fee.finalFee - newAmountPaid, 0);
          await tx.studentFee.update({
            where: { studentId: payment.studentId },
            data: { amountPaid: newAmountPaid, remainingFee: newRemaining },
          });
        }
      }
    }

    // If it transitions to failed and is a workshop payment, mark registration as failed.
    if (isTransitionToFailed && payment.eventRegistrationId) {
      await tx.eventRegistration.update({
        where: { id: payment.eventRegistrationId },
        data: { paymentStatus: "FAILED" },
      });
    }
  }));

  invalidateFeeListServerCaches(payment.student.schoolId);

  return NextResponse.json({ ok: true, stored: true, updated: true }, { status: 200 });
}

