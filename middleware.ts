import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, rateLimitKey } from "@/lib/rateLimit";

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

  const response = NextResponse.next();

  // Per-user responses must not be cached by the browser (e.g. parent portal bell).
  const skipApiCache =
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/notifications");

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
