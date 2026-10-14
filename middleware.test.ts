/**
 * @jest-environment node
 */
jest.mock("@/lib/cache/redis", () => ({
  redis: null,
  isRedisEnabled: () => false,
  isRedisConfigured: () => false,
}));

import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { middleware } from "./middleware";

jest.mock("next-auth/jwt", () => ({ getToken: jest.fn() }));

function request(path: string, ip = "1.2.3.4") {
  return new NextRequest(`http://localhost${path}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("middleware", () => {
  it("sets a nonce-based CSP on page requests, with a fresh nonce each time", async () => {
    const a = await middleware(request("/teacher"));
    const b = await middleware(request("/teacher"));
    const cspA = a.headers.get("Content-Security-Policy")!;
    const cspB = b.headers.get("Content-Security-Policy")!;
    expect(cspA).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(cspA).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(cspA).not.toBe(cspB);
  });

  it("does not set a CSP on API responses", async () => {
    const res = await middleware(request("/api/fees/summary"));
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

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

  describe("api request logging", () => {
    let info: jest.SpyInstance;
    beforeEach(() => {
      info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    });
    afterEach(() => info.mockRestore());

    it("logs schoolId, userId and role from the JWT", async () => {
      (getToken as jest.Mock).mockResolvedValue({ schoolId: "sch_1", id: "u1", role: "TEACHER" });
      await middleware(request("/api/class/list"));
      const line = JSON.parse(info.mock.calls[0][0]);
      expect(line).toMatchObject({
        event: "api_request",
        path: "/api/class/list",
        schoolId: "sch_1",
        userId: "u1",
        role: "TEACHER",
      });
    });

    it("logs schoolId null when there is no token or it cannot be read", async () => {
      (getToken as jest.Mock).mockRejectedValue(new Error("bad"));
      await middleware(request("/api/class/list"));
      expect(JSON.parse(info.mock.calls[0][0]).schoolId).toBeNull();
    });

    it("does not log health checks or non-API pages", async () => {
      await middleware(request("/api/health"));
      await middleware(request("/support"));
      expect(info).not.toHaveBeenCalled();
    });
  });
});
