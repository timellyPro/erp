jest.mock("@/lib/cache/redis", () => ({
  redis: null,
  isRedisEnabled: () => false,
}));

import { rateLimit, rateLimitKey } from "@/lib/rateLimit";

describe("rateLimit", () => {
  it("allows requests under the limit", async () => {
    const key = rateLimitKey("test", `case-${Math.random()}`);
    const r1 = await rateLimit(key, 3, 60);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
  });

  it("blocks once the limit is exceeded", async () => {
    const key = rateLimitKey("test", `case-${Math.random()}`);
    await rateLimit(key, 2, 60);
    await rateLimit(key, 2, 60);
    const r3 = await rateLimit(key, 2, 60);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("keeps separate counters for different keys", async () => {
    const keyA = rateLimitKey("test", `a-${Math.random()}`);
    const keyB = rateLimitKey("test", `b-${Math.random()}`);
    await rateLimit(keyA, 1, 60);
    const rA = await rateLimit(keyA, 1, 60);
    const rB = await rateLimit(keyB, 1, 60);
    expect(rA.allowed).toBe(false);
    expect(rB.allowed).toBe(true);
  });

  it("normalizes undefined/null identifier parts instead of throwing", () => {
    expect(rateLimitKey("login", undefined)).toBe("login:unknown");
    expect(rateLimitKey("login", null)).toBe("login:unknown");
    expect(rateLimitKey("login", "User@Example.com")).toBe("login:user@example.com");
  });
});
