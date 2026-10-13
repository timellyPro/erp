/** @jest-environment node */
import nextConfig from "./next.config";

describe("security headers", () => {
  it("sets the baseline security headers on every route", async () => {
    const config = nextConfig as unknown as {
      headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>;
    };
    const rules = await config.headers();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all).toBeDefined();
    const keys = all!.headers.map((h) => h.key);
    for (const k of [
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Content-Security-Policy",
    ]) {
      expect(keys).toContain(k);
    }
    const csp = all!.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
  });
});
