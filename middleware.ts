import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { rateLimit, rateLimitKey } from "@/lib/rateLimit";
import { buildCsp, generateNonce } from "@/lib/security/csp";

// Public, unauthenticated pages (see PRODUCTION_READINESS.md's rate-limiting
// finding): no session gates these, so they're the ones most exposed to
// scripted scraping/abuse. IP-keyed since there's no user to key by.
const PUBLIC_RATE_LIMITED_PATHS = ["/qr", "/screen", "/download"];
const PUBLIC_PATH_RATE_LIMIT_MAX = 60;
const PUBLIC_PATH_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

function clientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

// Skipped to keep uptime probes and auth polling from flooding the logs.
const REQUEST_LOG_SKIP_PREFIXES = ["/api/health", "/api/auth/"];

/**
 * One structured line per API request carrying the tenant (schoolId) so any log
 * can be filtered by school. Uses the JWT only (no DB hit); never blocks the request.
 * Plain console on purpose: this runs on the edge runtime.
 */
async function logApiRequest(request: NextRequest, pathname: string) {
  if (!pathname.startsWith("/api/") || REQUEST_LOG_SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return;
  let token: Awaited<ReturnType<typeof getToken>> = null;
  try {
    token = await getToken({ req: request });
  } catch {
    // unreadable token: log as anonymous
  }
  console.info(
    JSON.stringify({
      level: "info",
      event: "api_request",
      time: new Date().toISOString(),
      method: request.method,
      path: pathname,
      schoolId: (token?.schoolId as string | null | undefined) ?? null,
      userId: (token?.id as string | undefined) ?? null,
      role: (token?.role as string | undefined) ?? null,
    })
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    request.method === "GET" &&
    PUBLIC_RATE_LIMITED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    const result = await rateLimit(
      rateLimitKey("public-page", clientIp(request), pathname),
      PUBLIC_PATH_RATE_LIMIT_MAX,
      PUBLIC_PATH_RATE_LIMIT_WINDOW_SECONDS
    );
    if (!result.allowed) {
      return new NextResponse("Too many requests. Please try again shortly.", {
        status: 429,
        headers: { "Retry-After": String(result.resetInSeconds) },
      });
    }
  }

  await logApiRequest(request, pathname);

  // Page requests get a per-request CSP nonce (API responses are JSON/downloads: no CSP needed).
  // The policy must also be on the *request* headers so Next.js can read the nonce from it and
  // stamp it onto its own scripts.
  let response: NextResponse;
  if (pathname.startsWith("/api/")) {
    response = NextResponse.next();
  } else {
    const nonce = generateNonce();
    const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
  }

  // Per-user responses must not be cached by the browser (e.g. parent portal bell).
  const skipApiCache =
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/notifications") ||
    pathname.startsWith("/api/marks") ||
    pathname.startsWith("/api/exam-types");

  if (
    request.method === "GET" &&
    pathname.startsWith("/api/") &&
    !skipApiCache
  ) {
    response.headers.set(
      "Cache-Control",
      "private, max-age=60, stale-while-revalidate=300"
    );
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
