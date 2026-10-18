import prisma from "@/lib/db";
import { runInTenantScope, tenantDb } from "@/lib/db/tenantContext";
import { invalidateFeeListServerCaches } from "@/lib/fees/feeListServerCache";
import { recordPaymentAudit, type PaymentAuditActor } from "@/lib/fees/paymentAudit";
import { logger } from "@/lib/logger";

/**
 * Reconciles Payments stuck in PENDING (browser closed before /verify, webhook lost)
 * by asking the gateway for the real order status.
 *
 * Deliberately on the owner connection (`@/lib/db`) for the discovery query: it scans
 * every school in one pass, so there is no single tenant to scope to. Every write runs
 * inside `runInTenantScope(payment.student.schoolId)`. Callers must authenticate first
 * (see the CRON_SECRET check in app/api/cron/reconcile-payments/route.ts).
 *
 * Double-credit safety: the PENDING -> SUCCESS flip is a conditional `updateMany`
 * (`where status = PENDING`); only the caller whose update affects 1 row credits the
 * fee, so a concurrent /verify or webhook can never credit the same payment twice.
 */

/** Shown as the actor on history rows written by this job. */
const RECONCILE_ACTOR: PaymentAuditActor = { userId: null, name: "Payment reconcile job", role: "SYSTEM" };

const MIN_AGE_MS = 15 * 60 * 1000; // give the normal verify/webhook path time first
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // older than this needs a human
const BATCH_SIZE = 50;
const GATEWAY_TIMEOUT_MS = 10_000;

const hyperpgBaseUrl = process.env.HYPERPG_BASE_URL || "https://sandbox.hyperpg.in";

// Same terminal-failure set as app/api/payment/webhook/route.ts.
const FAILED_STATUSES = new Set([
  "AUTHENTICATION_FAILED",
  "AUTHORIZATION_FAILED",
  "JUSPAY_DECLINED",
  "CAPTURE_FAILED",
  "VOID_FAILED",
  "NOT_FOUND",
  "FAILURE",
  "FAILED",
]);

export type ReconcileResult = {
  checked: number;
  succeeded: number;
  failed: number;
  stillPending: number;
  errors: number;
  staleNeedingReview: number;
};

type Creds = { merchantId: string; apiKey: string } | null;

function buildAuthHeaders({ merchantId, apiKey }: { merchantId: string; apiKey: string }) {
  const style = process.env.HYPERPG_AUTH_STYLE || "api_key";
  const key = apiKey.replace(/^["']|["']$/g, "").trim();
  const auth =
    style === "merchant_key"
      ? Buffer.from(`${merchantId}:${key}`).toString("base64")
      : Buffer.from(`${key}:`, "utf8").toString("base64");
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Basic ${auth}`,
    "x-merchantid": merchantId.trim(),
  };
}

async function resolveCreds(schoolId: string, cache: Map<string, Creds>): Promise<Creds> {
  if (cache.has(schoolId)) return cache.get(schoolId)!;
  const settings = await prisma.schoolSettings.findUnique({
    where: { schoolId },
    select: { hyperpgMerchantId: true, hyperpgApiKey: true },
  });
  const merchantId =
    settings?.hyperpgMerchantId?.trim() || process.env.HYPERPG_MERCHANT_ID?.trim();
  const apiKey = settings?.hyperpgApiKey?.trim() || process.env.HYPERPG_API_KEY?.trim();
  const creds = merchantId && apiKey ? { merchantId, apiKey } : null;
  cache.set(schoolId, creds);
  return creds;
}

export async function reconcilePendingPayments(now = new Date()): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    checked: 0,
    succeeded: 0,
    failed: 0,
    stillPending: 0,
    errors: 0,
    staleNeedingReview: 0,
  };

  const where = {
    status: "PENDING",
    gateway: "HYPERPG",
    purpose: { in: ["FEES", "EVENT"] },
    transactionId: { not: null },
  };

  result.staleNeedingReview = await prisma.payment.count({
    where: { ...where, createdAt: { lt: new Date(now.getTime() - MAX_AGE_MS) } },
  });

  const pending = await prisma.payment.findMany({
    where: {
      ...where,
      createdAt: {
        lt: new Date(now.getTime() - MIN_AGE_MS),
        gte: new Date(now.getTime() - MAX_AGE_MS),
      },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: {
      id: true,
      studentId: true,
      amount: true,
      transactionId: true,
      eventRegistrationId: true,
      student: { select: { schoolId: true } },
    },
  });

  const credsCache = new Map<string, Creds>();

  for (const p of pending) {
    result.checked += 1;
    const schoolId = p.student.schoolId;
    try {
      const creds = await resolveCreds(schoolId, credsCache);
      if (!creds) {
        result.errors += 1;
        logger.warn(`[reconcile] no gateway credentials for school ${schoolId}`);
        continue;
      }

      const res = await fetch(
        `${hyperpgBaseUrl}/orders/${encodeURIComponent(p.transactionId!)}`,
        {
          method: "GET",
          headers: buildAuthHeaders(creds),
          signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
        }
      );
      if (!res.ok) {
        // 404 means the gateway never saw the order; treat as NOT_FOUND (failed).
        if (res.status !== 404) {
          result.errors += 1;
          logger.warn(`[reconcile] gateway ${res.status} for payment ${p.id}`);
          continue;
        }
      }
      const order = res.ok ? await res.json() : { status: "NOT_FOUND" };
      const gwStatus = String(order.status || "").toUpperCase();

      if (gwStatus === "CHARGED") {
        const orderAmount = Number(order.amount);
        if (orderAmount > 0 && Math.abs(orderAmount - p.amount) > 0.01) {
          result.errors += 1;
          logger.error(
            `[reconcile] amount mismatch for payment ${p.id}: gateway ${orderAmount} vs db ${p.amount}`
          );
          continue;
        }
        const credited = await runInTenantScope(schoolId, () =>
          tenantDb.$transaction(async (tx) => {
            const flipped = await tx.payment.updateMany({
              where: { id: p.id, status: "PENDING" },
              data: {
                status: "SUCCESS",
                hyperpgOrderId: order.id ?? undefined,
                hyperpgTxnId: order.txn_id ?? undefined,
                hyperpgStatus: gwStatus,
                hyperpgStatusId: typeof order.status_id === "number" ? order.status_id : undefined,
                hyperpgLastUpdatedAt: new Date(),
              },
            });
            if (flipped.count !== 1) return false; // verify/webhook got there first

            await recordPaymentAudit(tx, {
              schoolId,
              paymentId: p.id,
              studentId: p.studentId,
              action: "STATUS",
              actor: RECONCILE_ACTOR,
              summary: `Status PENDING -> SUCCESS (recovered by polling the gateway: ${gwStatus})`,
              before: { status: "PENDING" },
              after: { status: "SUCCESS", gatewayStatus: gwStatus },
            });

            if (p.eventRegistrationId) {
              await tx.eventRegistration.update({
                where: { id: p.eventRegistrationId },
                data: { paymentStatus: "PAID", paymentId: p.id },
              });
            } else {
              const fee = await tx.studentFee.findUnique({
                where: { studentId: p.studentId },
                select: { amountPaid: true, finalFee: true },
              });
              if (fee) {
                const newPaid = fee.amountPaid + p.amount;
                await tx.studentFee.update({
                  where: { studentId: p.studentId },
                  data: {
                    amountPaid: newPaid,
                    remainingFee: Math.max(fee.finalFee - newPaid, 0),
                  },
                });
              }
            }
            return true;
          })
        );
        if (credited) {
          result.succeeded += 1;
          invalidateFeeListServerCaches(schoolId);
          logger.info(`[reconcile] payment ${p.id} recovered as SUCCESS`);
        }
      } else if (FAILED_STATUSES.has(gwStatus)) {
        const failed = await runInTenantScope(schoolId, () =>
          tenantDb.$transaction(async (tx) => {
            const flipped = await tx.payment.updateMany({
              where: { id: p.id, status: "PENDING" },
              data: { status: "FAILED", hyperpgStatus: gwStatus, hyperpgLastUpdatedAt: new Date() },
            });
            if (flipped.count === 1) {
              await recordPaymentAudit(tx, {
                schoolId,
                paymentId: p.id,
                studentId: p.studentId,
                action: "STATUS",
                actor: RECONCILE_ACTOR,
                summary: `Status PENDING -> FAILED (gateway: ${gwStatus})`,
                before: { status: "PENDING" },
                after: { status: "FAILED", gatewayStatus: gwStatus },
              });
            }
            if (flipped.count === 1 && p.eventRegistrationId) {
              await tx.eventRegistration.update({
                where: { id: p.eventRegistrationId },
                data: { paymentStatus: "FAILED" },
              });
            }
            return flipped.count === 1;
          })
        );
        if (failed) result.failed += 1;
      } else {
        result.stillPending += 1;
      }
    } catch (error) {
      result.errors += 1;
      logger.error(`[reconcile] payment ${p.id} failed`, error);
    }
  }

  if (result.staleNeedingReview > 0) {
    logger.warn(
      `[reconcile] ${result.staleNeedingReview} PENDING payment(s) older than 7 days need manual review`
    );
  }
  return result;
}
