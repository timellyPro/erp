import { redis, isRedisEnabled } from "@/lib/cache/redis";
import { logger } from "@/lib/logger";

/**
 * Fixed-window rate limiter on the existing Upstash Redis client (lib/cache/redis.ts).
 * Fails open: if Redis is disabled/unreachable, requests are allowed rather than
 * blocked, consistent with this app's documented fail-open posture for Redis outages
 * (see lib/cache/redis.ts's circuit breaker and CLAUDE.md's fail-open tradeoff for
 * auth DB sync — same principle: a cache/infra outage should not itself become an
 * outage for legitimate users).
 *
 * Keys are namespaced per caller (`rateLimitKey`) so a login-throttle counter can't
 * collide with an event-registration or payment-order counter.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Requests remaining in the current window (0 if blocked). */
  remaining: number;
  /** Seconds until the window resets. */
  resetInSeconds: number;
};

const inMemoryCounters = new Map<string, { count: number; resetAt: number }>();

function inMemoryFallback(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const existing = inMemoryCounters.get(key);
  if (!existing || existing.resetAt <= now) {
    inMemoryCounters.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, resetInSeconds: windowSeconds };
  }
  existing.count += 1;
  const resetInSeconds = Math.max(0, Math.ceil((existing.resetAt - now) / 1000));
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, resetInSeconds };
  }
  return { allowed: true, remaining: Math.max(0, limit - existing.count), resetInSeconds };
}

/**
 * Checks and increments a fixed-window counter for `key`.
 *
 * NOTE: in-process fallback (used when Redis is disabled/unreachable) only limits
 * per-server-instance traffic, not globally across a multi-instance deployment — this
 * matches the existing tradeoff already accepted for `chairman/me`'s in-process cache
 * (see PRODUCTION_READINESS.md's caching section). It still meaningfully raises the
 * bar over no limiting at all.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  if (!isRedisEnabled() || !redis) {
    return inMemoryFallback(key, limit, windowSeconds);
  }

  const redisKey = `ratelimit:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    const ttl = await redis.ttl(redisKey);
    const resetInSeconds = ttl > 0 ? ttl : windowSeconds;
    if (count > limit) {
      return { allowed: false, remaining: 0, resetInSeconds };
    }
    return { allowed: true, remaining: Math.max(0, limit - count), resetInSeconds };
  } catch (error) {
    logger.warn("[rateLimit] Redis check failed, failing open.", error);
    return inMemoryFallback(key, limit, windowSeconds);
  }
}

/** Builds a stable rate-limit key from a namespace and one or more identifiers. */
export function rateLimitKey(namespace: string, ...parts: Array<string | null | undefined>): string {
  const safeParts = parts.map((p) => (p ?? "unknown").toLowerCase().trim() || "unknown");
  return [namespace, ...safeParts].join(":");
}
