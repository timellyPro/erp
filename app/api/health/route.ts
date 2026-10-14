import { NextResponse } from "next/server";
// Owner connection on purpose: this route reads no tenant data, only `SELECT 1`.
// Listed in lib/db/ownerConnectionRoutes.json.
import prisma from "@/lib/db";
import { getEnvProblems } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

/**
 * GET /api/health
 * Unauthenticated liveness/readiness probe for uptime monitors and deploy gates.
 * Returns 200 when the database answers and required config is present, else 503.
 * The body names which check failed but never leaks values or error details.
 */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db health check timed out")), DB_TIMEOUT_MS)
      ),
    ]);
    checks.database = "ok";
  } catch (error) {
    checks.database = "fail";
    logger.error("[health] database check failed", error);
  }

  const envProblems = getEnvProblems();
  checks.config = envProblems.length === 0 ? "ok" : "fail";
  if (envProblems.length > 0) {
    logger.error("[health] configuration problems", envProblems);
  }

  const healthy = Object.values(checks).every((c) => c === "ok");
  return NextResponse.json(
    { status: healthy ? "ok" : "unhealthy", checks, time: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
