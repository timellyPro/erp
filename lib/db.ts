import { AsyncLocalStorage } from "async_hooks";
import { PrismaClient } from "@prisma/client";
import { bumpRedisCacheVersion, getRedisCacheVersion, isRedisEnabled, redisGet, redisSet } from "@/lib/redis";

/** Bulk writes (e.g. recalculate all fees) bump Redis once at the end, not per row. */
const deferredInvalidation = new AsyncLocalStorage<{ active: boolean }>();

export function isDeferredCacheInvalidation(): boolean {
  return deferredInvalidation.getStore()?.active === true;
}

/**
 * School-wide bulk jobs (recalculate fees): hit Postgres directly, one cache bump at end.
 * Avoids hundreds of Redis round-trips and connection pool starvation.
 */
export async function runWithDeferredCacheInvalidation<T>(fn: () => Promise<T>): Promise<T> {
  return deferredInvalidation.run({ active: true }, async () => {
    try {
      return await fn();
    } finally {
      clearLocalCache();
      if (isRedisEnabled()) {
        try {
          await bumpRedisCacheVersion();
          console.info("[Redis] INVALIDATE (deferred bulk write)");
        } catch (error) {
          console.warn("[Redis] Deferred cache bump failed (DB writes already committed).", error);
        }
      }
    }
  });
}

// Prefer DATABASE_URL (port 6543, transaction pooler) for runtime - better for serverless and avoids
// connection resets. Use DIRECT_URL only for migrations (schema directUrl).
const base = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!base) {
  console.error("DATABASE_URL or DIRECT_URL environment variable is not set");
}

function withParam(url: string, key: string, value: string) {
  if (!url) return url;
  const hasQuery = url.includes("?");
  const encodedKey = `${key}=`;
  if (url.includes(encodedKey)) return url;
  return `${url}${hasQuery ? "&" : "?"}${key}=${value}`;
}

let connectionString = base || "";
if (connectionString) {
  connectionString = withParam(connectionString, "statement_timeout", "120000");
  // Default was 3 and exhausted quickly with concurrent API + NextAuth JWT work.
  // Override with PRISMA_CONNECTION_LIMIT in .env if your host requires a specific cap.
  const poolLimit = process.env.PRISMA_CONNECTION_LIMIT || "15";
  if (!connectionString.includes("connection_limit=")) {
    connectionString = withParam(connectionString, "connection_limit", poolLimit);
  }
  connectionString = withParam(connectionString, "pool_timeout", "30");
  connectionString = withParam(connectionString, "connect_timeout", "15");
}

const prismaClientSingleton = () => {
  if (!connectionString) {
    throw new Error("Database connection string is not configured");
  }
  return new PrismaClient({
    datasourceUrl: connectionString,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
};

const READ_OPERATIONS = new Set(["findUnique", "findFirst", "findMany", "count", "aggregate", "groupBy"]);
const WRITE_OPERATIONS = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);
const localCacheEnabled = (process.env.LOCAL_QUERY_CACHE_ENABLED || "true").toLowerCase() !== "false";
const localCacheTtlMs = Number(process.env.LOCAL_QUERY_CACHE_TTL_MS || "4000");

type LocalCacheEntry = {
  value: unknown;
  expiresAt: number;
};

const localQueryCache = new Map<string, LocalCacheEntry>();

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

function isReadOperation(operation: string) {
  return READ_OPERATIONS.has(operation);
}

function isWriteOperation(operation: string) {
  return WRITE_OPERATIONS.has(operation);
}

function getCacheKey(model: string | undefined, operation: string, args: unknown, version: number) {
  const modelName = model ?? "raw";
  return `prisma:${modelName}:${operation}:v${version}:${stableStringify(args)}`;
}

function getLocalCachedValue(cacheKey: string) {
  if (!localCacheEnabled) return null;
  const entry = localQueryCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    localQueryCache.delete(cacheKey);
    return null;
  }
  return entry.value;
}

function setLocalCachedValue(cacheKey: string, value: unknown) {
  if (!localCacheEnabled) return;
  localQueryCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + localCacheTtlMs,
  });
}

function clearLocalCache() {
  if (!localCacheEnabled) return;
  localQueryCache.clear();
}

declare const globalThis: {
  prismaGlobal?: ReturnType<typeof createPrismaWithRedis>;
} & typeof global;

const createPrismaWithRedis = () => {
  const client = prismaClientSingleton();

  return client.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (!model) {
          return query(args);
        }

        if (isDeferredCacheInvalidation()) {
          return query(args);
        }

        if (!isRedisEnabled()) {
          return query(args);
        }

        if (isReadOperation(operation)) {
          const version = await getRedisCacheVersion();
          const cacheKey = getCacheKey(model, operation, args, version);
          const localCached = getLocalCachedValue(cacheKey);
          if (localCached !== null) {
            console.info(`[LocalCache] HIT ${model}.${operation}`);
            return localCached;
          }

          try {
            const cached = await redisGet(cacheKey);
            if (cached !== null) {
              console.info(`[Redis] HIT ${model}.${operation}`);
              setLocalCachedValue(cacheKey, cached);
              return cached;
            }
            console.info(`[Redis] MISS ${model}.${operation}`);
          } catch (error) {
            console.warn(`[Redis] Read failed for ${model}.${operation}. Falling back to DB.`, error);
          }

          const result = await query(args);
          setLocalCachedValue(cacheKey, result);

          try {
            const stored = await redisSet(cacheKey, result, 300);
            if (stored) {
              console.info(`[Redis] SET ${model}.${operation}`);
            }
          } catch (error) {
            console.warn(`[Redis] Write failed for ${model}.${operation}.`, error);
          }

          return result;
        }

        const result = await query(args);

        if (isWriteOperation(operation)) {
          clearLocalCache();
          await bumpRedisCacheVersion();
          console.info(`[Redis] INVALIDATE ${model}.${operation}`);
        }

        return result;
      },
    },
  });
};

let prisma: ReturnType<typeof createPrismaWithRedis> = globalThis.prismaGlobal ?? createPrismaWithRedis();

// Next.js dev HMR can keep a Prisma singleton from before `prisma generate`; new models are then undefined.
const delegate = prisma as unknown as { extraFeeHeadTemplate?: { create?: unknown } };
if (
  process.env.NODE_ENV === "development" &&
  typeof delegate.extraFeeHeadTemplate?.create !== "function"
) {
  prisma = createPrismaWithRedis();
}

globalThis.prismaGlobal = prisma;

export default prisma;