import { NextResponse } from "next/server";
import { runFeesBackupCron } from "@/lib/fees/runFeesBackupCron";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

function isAuthorized(req: Request): boolean {
  // Bearer-only on purpose: Vercel Cron (and the GitHub workflow) send
  // `Authorization: Bearer $CRON_SECRET`. Do not trust the spoofable
  // `x-vercel-cron` header or a ?secret= query param (leaks into logs).
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

/**
 * GET /api/cron/fees-backup-email
 * Called by Vercel Cron, GitHub Actions, or external schedulers.
 * Sends the Excel backup once per day after the configured IST time.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runFeesBackupCron();
    return NextResponse.json(result);
  } catch (error: unknown) {
    logger.error("Fees backup email cron error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}

// Heavy report/export: raise the serverless timeout above the default.
export const maxDuration = 60;
