import { buildCsp, generateNonce } from "./csp";

describe("csp", () => {
  it("generates a different base64 nonce each time", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("allows scripts only by nonce in production (no unsafe-inline / unsafe-eval)", () => {
    const csp = buildCsp("abc123", false);
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("allows unsafe-eval only in development (React dev tooling)", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
    expect(buildCsp("n", false)).not.toContain("'unsafe-eval'");
  });

  it("keeps the fixed hardening directives", () => {
    const csp = buildCsp("n", false);
    for (const d of ["object-src 'none'", "frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'"]) {
      expect(csp).toContain(d);
    }
  });
});
