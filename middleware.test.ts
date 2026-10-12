/**
 * @jest-environment node
 */
jest.mock("@/lib/cache/redis", () => ({
  redis: null,
  isRedisEnabled: () => false,
}));

import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function request(path: string, ip = "1.2.3.4") {
  return new NextRequest(`http://localhost${path}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("middleware", () => {
  it("sets a private Cache-Control header on GET /api/* (excluding auth/notifications)", async () => {
    const res = await middleware(request("/api/fees/summary"));
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=60, stale-while-revalidate=300"
    );
  });

  it("does not set Cache-Control for /api/auth/*", async () => {
    const res = await middleware(request("/api/auth/session"));
    expect(res.headers.get("Cache-Control")).toBeNull();
  });

  it("allows a request to /qr under the rate limit", async () => {
    const res = await middleware(request("/qr", "9.9.9.1"));
    expect(res.status).toBe(200);
  });

  it("blocks a client that exceeds the rate limit on a public page", async () => {
    const ip = "9.9.9.2";
    let last;
    for (let i = 0; i < 61; i++) {
      last = await middleware(request("/screen", ip));
    }
    expect(last!.status).toBe(429);
  });

  it("keeps separate rate-limit counters per path for the same client", async () => {
    const ip = "9.9.9.3";
    for (let i = 0; i < 60; i++) {
      await middleware(request("/download", ip));
    }
    const stillOnDownload = await middleware(request("/download", ip));
    expect(stillOnDownload.status).toBe(429);

    const differentPath = await middleware(request("/qr", ip));
    expect(differentPath.status).toBe(200);
  });

  it("does not rate limit unrelated pages", async () => {
    const ip = "9.9.9.4";
    let last;
    for (let i = 0; i < 65; i++) {
      last = await middleware(request("/", ip));
    }
    expect(last!.status).toBe(200);
  });
});
