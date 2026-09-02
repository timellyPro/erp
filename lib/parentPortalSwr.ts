import { isRedisEnabled } from "@/lib/redis";
import { tenantCacheKey, swrGet, swrSet } from "@/lib/tenantCache";
import {
  getParentPortalServerCached,
  setParentPortalServerCached,
} from "@/lib/parentPortalServerCache";

export type ParentSwrTtl = {
  freshMs: number;
  staleMs: number;
  redisExSec: number;
  serverTtlMs?: number;
};

export const PARENT_DASHBOARD_FAST_TTL: ParentSwrTtl = {
  freshMs: 60_000,
  staleMs: 10 * 60_000,
  redisExSec: 600,
  serverTtlMs: 5 * 60_000,
};

export const PARENT_DASHBOARD_FULL_TTL: ParentSwrTtl = {
  freshMs: 60_000,
  staleMs: 10 * 60_000,
  redisExSec: 600,
  serverTtlMs: 5 * 60_000,
};

export const PARENT_ANALYTICS_TTL: ParentSwrTtl = {
  freshMs: 60_000,
  staleMs: 10 * 60_000,
  redisExSec: 600,
  serverTtlMs: 5 * 60_000,
};

export const PARENT_LIST_TTL: ParentSwrTtl = {
  freshMs: 60_000,
  staleMs: 10 * 60_000,
  redisExSec: 600,
  serverTtlMs: 5 * 60_000,
};

export async function parentPortalSwrRead<T>(opts: {
  schoolId: string;
  namespace: string;
  resource: string;
  params: unknown;
  serverKey: string;
  ttl: ParentSwrTtl;
  bypass?: boolean;
}): Promise<{ value: T | null; stale: boolean }> {
  if (!opts.bypass) {
    const memHit = getParentPortalServerCached<T>(opts.serverKey);
    if (memHit) return { value: memHit, stale: false };
  }

  if (!opts.bypass && isRedisEnabled()) {
    const cacheKey = await tenantCacheKey(opts.schoolId, opts.namespace, opts.resource, opts.params);
    const cached = await swrGet<T>(cacheKey);
    const now = Date.now();
    if (cached && now < cached.staleUntil) {
      setParentPortalServerCached(opts.serverKey, cached.value, opts.ttl.serverTtlMs ?? 90_000);
      return { value: cached.value, stale: now >= cached.freshUntil };
    }
  }

  return { value: null, stale: false };
}

export async function parentPortalSwrWrite<T>(opts: {
  schoolId: string;
  namespace: string;
  resource: string;
  params: unknown;
  serverKey: string;
  ttl: ParentSwrTtl;
  value: T;
}): Promise<void> {
  setParentPortalServerCached(opts.serverKey, opts.value, opts.ttl.serverTtlMs ?? 90_000);

  if (!isRedisEnabled()) return;

  const now = Date.now();
  const cacheKey = await tenantCacheKey(opts.schoolId, opts.namespace, opts.resource, opts.params);
  await swrSet(
    cacheKey,
    { value: opts.value, freshUntil: now + opts.ttl.freshMs, staleUntil: now + opts.ttl.staleMs },
    opts.ttl.redisExSec
  );
}
