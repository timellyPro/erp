import { NextResponse } from "next/server";
import { reconcilePendingPayments } from "@/lib/payments/reconcilePendingPayments";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  // Bearer-only, same as the fees-backup-email cron.
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

/**
 * GET /api/cron/reconcile-payments
 * Asks the gateway about PENDING payments older than 15 minutes and settles them.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await reconcilePendingPayments();
    return NextResponse.json(result);
  } catch (error: unknown) {
    logger.error("Reconcile payments cron error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
