/**
 * Redis configured but unreachable (circuit open): "tight" callers get a smaller
 * per-instance budget; default callers keep the full limit.
 */
jest.mock("@/lib/cache/redis", () => ({
  redis: null,
  isRedisEnabled: () => false,
  isRedisConfigured: () => true,
}));

import { rateLimit, rateLimitKey } from "@/lib/rateLimit";

async function attempts(key: string, limit: number, opts?: { onRedisDown?: "open" | "tight" }) {
  let allowed = 0;
  for (let i = 0; i < limit + 5; i++) {
    if ((await rateLimit(key, limit, 60, opts)).allowed) allowed++;
  }
  return allowed;
}

describe("rateLimit while Redis is down", () => {
  it("allows the full limit by default", async () => {
    expect(await attempts(rateLimitKey("t", `a-${Math.random()}`), 10)).toBe(10);
  });

  it("allows only a quarter of the limit (min 3) when tight", async () => {
    expect(await attempts(rateLimitKey("t", `b-${Math.random()}`), 10, { onRedisDown: "tight" })).toBe(3);
    expect(await attempts(rateLimitKey("t", `c-${Math.random()}`), 40, { onRedisDown: "tight" })).toBe(10);
  });
});
