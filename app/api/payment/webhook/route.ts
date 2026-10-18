import { NextResponse } from "next/server";
import crypto from "crypto";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import type { Prisma } from "@prisma/client";
import { invalidateFeeListServerCaches } from "@/lib/fees/feeListServerCache";
import { recordPaymentAudit, type PaymentAuditActor } from "@/lib/fees/paymentAudit";
import { logger } from "@/lib/logger";

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

/** Shown as the actor on history rows written by gateway callbacks. */
const GATEWAY_ACTOR: PaymentAuditActor = { userId: null, name: "Payment gateway (HyperPG)", role: "SYSTEM" };

/** Prisma unique-constraint violation (P2002), duck-typed so tests need no Prisma error class. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
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

  // Store the event first (audit + de-duplication).
  //
  // Only a unique-id collision means "we have seen this event". Any other failure (database
  // down, table missing) must NOT be acknowledged: the gateway would stop retrying and the
  // payment status would never be updated.
  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        id: eventId,
        eventName: eventName ?? undefined,
        orderId: orderId ?? undefined,
        hyperpgOrderId: hyperpgOrderId ?? undefined,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error: unknown) {
    if (!isUniqueViolation(error)) {
      logger.error("[payment-webhook] could not store event", error);
      return NextResponse.json({ ok: false, message: "Could not store webhook event" }, { status: 500 });
    }
    // Seen before. If it was fully processed, acknowledge. If the first attempt stored the event
    // but failed before applying it, process it again: applying a status is idempotent (side
    // effects run only on a real status transition).
    let seen: { processedAt: Date | null } | null;
    try {
      seen = await prisma.paymentWebhookEvent.findUnique({
        where: { id: eventId },
        select: { processedAt: true },
      });
    } catch (lookupError: unknown) {
      logger.error("[payment-webhook] could not read stored event", lookupError);
      return NextResponse.json({ ok: false, message: "Could not read webhook event" }, { status: 500 });
    }
    if (seen?.processedAt) {
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }
  }

  const markProcessed = async () => {
    try {
      await prisma.paymentWebhookEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
    } catch (error: unknown) {
      // The work is done; a retry would re-apply it harmlessly. Do not fail the response.
      logger.warn("[payment-webhook] could not mark event processed", error);
    }
  };

  if (!orderId && !hyperpgOrderId) {
    await markProcessed();
    return NextResponse.json({ ok: true, stored: true, updated: false, reason: "No order identifiers" }, { status: 200 });
  }

  try {
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
      // Not ours (or already gone). A retry cannot change that, and the reconcile-payments cron
      // settles any pending payment of ours by polling the gateway, so acknowledge.
      await markProcessed();
      return NextResponse.json({ ok: true, stored: true, updated: false, reason: "Payment not found" }, { status: 200 });
    }

    const schoolId = payment.student.schoolId;
    const reportedAmount =
      order && typeof order.amount === "number" && Number.isFinite(order.amount) ? order.amount : null;

    // Apply updates and side-effects only on status transition.
    const outcome = await runInTenantScope(schoolId, () => prisma.$transaction(async (tx) => {
      const before = await tx.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });

      const nextStatus = internalStatus as "PENDING" | "SUCCESS" | "FAILED";
      const isTransitionToSuccess = before?.status !== "SUCCESS" && nextStatus === "SUCCESS";
      const isTransitionToFailed = before?.status !== "FAILED" && nextStatus === "FAILED";

      // Never credit a different amount than the one we asked the gateway to collect. Leave the
      // payment untouched and raise an ALERT in its history for a person to resolve.
      if (isTransitionToSuccess && reportedAmount !== null && Math.abs(reportedAmount - payment.amount) > 0.01) {
        await recordPaymentAudit(tx, {
          schoolId,
          paymentId: payment.id,
          studentId: payment.studentId,
          action: "ALERT",
          actor: GATEWAY_ACTOR,
          summary: `Gateway reports ${reportedAmount} but this payment is ${payment.amount}; left unchanged for review`,
          before: { status: before?.status ?? null, amount: payment.amount },
          after: { gatewayAmount: reportedAmount, gatewayStatus: hyperpgStatus, eventId },
        });
        return { held: true as const };
      }

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

      if (before?.status !== nextStatus) {
        await recordPaymentAudit(tx, {
          schoolId,
          paymentId: payment.id,
          studentId: payment.studentId,
          action: "STATUS",
          actor: GATEWAY_ACTOR,
          summary: `Status ${before?.status ?? "unknown"} -> ${nextStatus} (gateway: ${hyperpgStatus ?? "n/a"})`,
          before: { status: before?.status ?? null },
          after: { status: nextStatus, gatewayStatus: hyperpgStatus, eventId },
        });
      }

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

      return { held: false as const };
    }));

    await markProcessed();

    if (outcome.held) {
      return NextResponse.json(
        { ok: true, stored: true, updated: false, reason: "Amount mismatch: held for review" },
        { status: 200 }
      );
    }

    invalidateFeeListServerCaches(schoolId);
    return NextResponse.json({ ok: true, stored: true, updated: true }, { status: 200 });
  } catch (error: unknown) {
    // The event stays unprocessed (processedAt is null), so the gateway's retry applies it.
    logger.error("[payment-webhook] processing failed", error);
    return NextResponse.json({ ok: false, message: "Webhook processing failed; will retry" }, { status: 500 });
  }
}
