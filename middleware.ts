import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const { pathname } = request.nextUrl;

  // Per-user responses must not be cached by the browser (e.g. parent portal bell).
  const skipApiCache =
    pathname.startsWith("/api/auth/") ||
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
