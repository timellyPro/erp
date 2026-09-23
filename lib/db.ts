import { AsyncLocalStorage } from "async_hooks";
import { PrismaClient } from "@prisma/client";
import { bumpTenantCacheVersion } from "@/lib/redis";

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
      // Endpoint-level caches use tenant-scoped versions; callers should bump the tenant once
      // after bulk jobs complete (see `bumpTenantCacheVersion`).
    }
  });
}

// Prefer DATABASE_URL (port 6543, transaction pooler) in production.
// In local/dev, prefer DIRECT_URL (session pooler :5432) — far more reliable for
// long-lived Next.js + auth when the transaction pooler is saturated/slow.
const base =
  process.env.NODE_ENV === "development" && process.env.DIRECT_URL
    ? process.env.DIRECT_URL
    : process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!base) {
  console.error("DATABASE_URL or DIRECT_URL environment variable is not set");
}

function withParam(url: string, key: string, value: string) {
  if (!url) return url;
  const encodedKey = `${key}=`;
  if (url.includes(encodedKey)) {
    return url.replace(new RegExp(`([?&])${key}=[^&]*`), `$1${key}=${value}`);
  }
  const hasQuery = url.includes("?");
  return `${url}${hasQuery ? "&" : "?"}${key}=${value}`;
}

let connectionString = base || "";
if (connectionString) {
  // Supabase transaction pooler (6543 / pgbouncer=true): keep Prisma's pool modest.
  // connection_limit=1 breaks Promise.all dashboards; too high exhausts PgBouncer.
  const isPgBouncer =
    /(?:^|[?&])pgbouncer=true(?:&|$)/i.test(connectionString) ||
    /:6543(?:\/|\?|$)/.test(connectionString);
  if (!isPgBouncer) {
    connectionString = withParam(connectionString, "statement_timeout", "120000");
  }
  // Dev used to use 2; parallel tab warmers (exams terms+types+subjects) hit P2024.
  // Student-details fans out shell/payments/breakdown — need headroom or queries queue for ~7–10s.
  // Keep prod PgBouncer modest; override anytime with PRISMA_CONNECTION_LIMIT.
  const poolLimit =
    process.env.PRISMA_CONNECTION_LIMIT ||
    (isPgBouncer
      ? process.env.NODE_ENV === "development"
        ? "8"
        : "5"
      : process.env.NODE_ENV === "development"
        ? "10"
        : "8");
  connectionString = withParam(connectionString, "connection_limit", poolLimit);
  connectionString = withParam(connectionString, "pool_timeout", "60");
  connectionString = withParam(connectionString, "connect_timeout", "10");
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

const WRITE_OPERATIONS = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);
const localCacheEnabled = (process.env.LOCAL_QUERY_CACHE_ENABLED || "true").toLowerCase() !== "false";
const localCacheTtlMs = Number(process.env.LOCAL_QUERY_CACHE_TTL_MS || "45000");

type LocalCacheEntry = {
  value: unknown;
  expiresAt: number;
};

const localQueryCache = new Map<string, LocalCacheEntry>();

function isWriteOperation(operation: string) {
  return WRITE_OPERATIONS.has(operation);
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

function stableArgsKey(args: unknown): string {
  try {
    return JSON.stringify(args, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return String(args);
  }
}

const READ_OPERATIONS = new Set([
  "findFirst",
  "findMany",
  "findUnique",
  "count",
  "aggregate",
  "groupBy",
  "findRaw",
  "aggregateRaw",
  "queryRaw",
]);

declare const globalThis: {
  prismaGlobal?: ReturnType<typeof createPrisma>;
  prismaConnectionString?: string;
} & typeof global;

const createPrisma = () => {
  const client = prismaClientSingleton();

  return client.$extends({
    query: {
      async $allOperations({ operation, args, model, query }) {
        const start = performance.now();
        const canCache =
          localCacheEnabled &&
          model &&
          READ_OPERATIONS.has(operation) &&
          !isDeferredCacheInvalidation();
        const cacheKey = canCache ? `pq:${model}:${operation}:${stableArgsKey(args)}` : null;

        if (cacheKey) {
          const hit = getLocalCachedValue(cacheKey);
          if (hit !== null) return hit;
        }

        try {
          const result = await query(args);
          if (cacheKey) setLocalCachedValue(cacheKey, result);
          return result;
        } finally {
          const ms = performance.now() - start;
          const slowMs = Number(process.env.PRISMA_SLOW_QUERY_MS || "50");
          if (ms >= slowMs) {
            console.warn("prisma_slow_query", {
              model,
              operation,
              ms: Math.round(ms),
            });
          }

          if (!isDeferredCacheInvalidation() && isWriteOperation(operation)) {
            clearLocalCache();
            // Backup schedule / global config writes are not school portal data.
            if (model === "BackupEmailSchedule") {
              // no tenant cache bump
            } else {
              const a = args as { data?: { schoolId?: string }; where?: { schoolId?: string } };
              const schoolId =
                typeof a?.data?.schoolId === "string"
                  ? a.data.schoolId
                  : typeof a?.where?.schoolId === "string"
                    ? a.where.schoolId
                    : null;
              if (schoolId) {
                bumpTenantCacheVersion(schoolId).catch(() => {
                  // ignore cache invalidation errors; DB write already committed
                });
              }
            }
          }
        }
      },
    },
  });
};

let prisma: ReturnType<typeof createPrisma>;
if (
  globalThis.prismaGlobal &&
  globalThis.prismaConnectionString === connectionString
) {
  prisma = globalThis.prismaGlobal;
} else {
  // Recreate when pool params / URL change (dev HMR otherwise keeps connection_limit=1 forever)
  void globalThis.prismaGlobal?.$disconnect().catch(() => {});
  prisma = createPrisma();
}

// Next.js dev HMR can keep a Prisma singleton from before `prisma generate`; new models are then undefined.
const delegate = prisma as unknown as {
  extraFeeHeadTemplate?: { create?: unknown };
  timetable?: { create?: unknown };
  backupEmailSchedule?: { findFirst?: unknown };
};
if (
  process.env.NODE_ENV === "development" &&
  (typeof delegate.extraFeeHeadTemplate?.create !== "function" ||
    typeof delegate.timetable?.create !== "function" ||
    typeof delegate.backupEmailSchedule?.findFirst !== "function")
) {
  void prisma.$disconnect().catch(() => {});
  prisma = createPrisma();
}

globalThis.prismaGlobal = prisma;
globalThis.prismaConnectionString = connectionString;

export default prisma;