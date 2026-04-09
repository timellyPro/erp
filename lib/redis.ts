import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redisFeatureFlag = (process.env.REDIS_ENABLED || "true").toLowerCase() !== "false";
const redisTimeoutMs = Number(process.env.REDIS_TIMEOUT_MS || "120");
const redisCircuitCooldownMs = Number(process.env.REDIS_COOLDOWN_MS || "30000");
const redisVersionSyncMs = Number(process.env.REDIS_VERSION_SYNC_MS || "2000");

const redisEnabled = redisFeatureFlag && Boolean(redisUrl && redisToken);

let redisDisabledUntil = 0;
let redisFailureCount = 0;
let localCacheVersion = 0;
let lastVersionReadAt = 0;

export const redis = redisEnabled
  ? new Redis({
      url: redisUrl as string,
      token: redisToken as string,
    })
  : null;

export function isRedisEnabled() {
  return redisEnabled && redis !== null && Date.now() >= redisDisabledUntil;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Redis operation timed out")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function markRedisSuccess() {
  redisFailureCount = 0;
}

function markRedisFailure(context: string, error?: unknown) {
  redisFailureCount += 1;
  console.warn(`[Redis] ${context} failed (${redisFailureCount}).`, error);
  if (redisFailureCount >= 2) {
    redisDisabledUntil = Date.now() + redisCircuitCooldownMs;
    redisFailureCount = 0;
    console.warn(`[Redis] Temporarily disabled for ${redisCircuitCooldownMs}ms to keep APIs fast.`);
  }
}

export async function getRedisCacheVersion(): Promise<number> {
  if (!isRedisEnabled()) return localCacheVersion;

  const now = Date.now();
  if (now - lastVersionReadAt < redisVersionSyncMs) {
    return localCacheVersion;
  }

  try {
    const rawVersion = await withTimeout(
      redis!.get<number>("cache:global:version"),
      redisTimeoutMs
    );
    const parsed = typeof rawVersion === "number" && Number.isFinite(rawVersion) ? rawVersion : 0;
    localCacheVersion = parsed;
    lastVersionReadAt = now;
    markRedisSuccess();
    return parsed;
  } catch (error) {
    markRedisFailure("Version read", error);
    return localCacheVersion;
  }
}

export async function bumpRedisCacheVersion() {
  localCacheVersion += 1;
  lastVersionReadAt = Date.now();
  if (!isRedisEnabled()) return;

  try {
    await withTimeout(redis!.incr("cache:global:version"), redisTimeoutMs);
    markRedisSuccess();
    console.info("[Redis] Cache version bumped after write operation.");
  } catch (error) {
    markRedisFailure("Version bump", error);
  }
}

export async function redisGet(key: string) {
  if (!isRedisEnabled()) return null;
  try {
    const value = await withTimeout(redis!.get(key), redisTimeoutMs);
    markRedisSuccess();
    return value;
  } catch (error) {
    markRedisFailure(`GET ${key}`, error);
    return null;
  }
}

export async function redisSet(key: string, value: unknown, ttlSeconds: number) {
  if (!isRedisEnabled()) return false;
  try {
    await withTimeout(redis!.set(key, value, { ex: ttlSeconds }), redisTimeoutMs);
    markRedisSuccess();
    return true;
  } catch (error) {
    markRedisFailure(`SET ${key}`, error);
    return false;
  }
}
