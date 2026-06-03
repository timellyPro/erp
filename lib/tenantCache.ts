import { createHash } from "crypto";
import { isRedisEnabled, redisGet, redisSet, bumpTenantCacheVersion, getTenantCacheVersion } from "@/lib/redis";

export type SwrEntry<T> = {
  value: T;
  freshUntil: number;
  staleUntil: number;
};

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function tenantCacheKey(
  schoolId: string,
  namespace: string,
  resource: string,
  params: unknown
): Promise<string> {
  const v = await getTenantCacheVersion(schoolId);
  const paramsHash = sha256(stableStringify(params));
  return `cache:tenant:${schoolId}:${namespace}:${resource}:v${v}:${paramsHash}`;
}

export async function swrGet<T>(key: string): Promise<SwrEntry<T> | null> {
  if (!isRedisEnabled()) return null;
  const cached = await redisGet(key);
  return (cached as SwrEntry<T> | null) ?? null;
}

export async function swrSet<T>(key: string, entry: SwrEntry<T>, ttlSeconds: number): Promise<void> {
  if (!isRedisEnabled()) return;
  await redisSet(key, entry, ttlSeconds);
}

export async function invalidateTenant(schoolId: string): Promise<void> {
  await bumpTenantCacheVersion(schoolId);
}

