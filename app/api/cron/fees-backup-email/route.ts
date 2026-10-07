import { NextResponse } from "next/server";
import { runFeesBackupCron } from "@/lib/runFeesBackupCron";

function isAuthorized(req: Request): boolean {
  // Vercel Cron sends this header on scheduled invocations
  if (req.headers.get("x-vercel-cron") === "1") return true;

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;

  // Allow ?secret= for external cron services (cron-job.org, etc.)
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") === secret) return true;
  } catch {
    // ignore
  }

  return false;
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
    console.error("Fees backup email cron error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
