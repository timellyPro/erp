// Redis is not configured in tests; use a tiny in-process version counter with the same shape.
jest.mock("@/lib/cache/redis", () => {
  const versions = new Map<string, number>();
  return {
    getTenantCacheVersion: async (id: string) => versions.get(id) ?? 0,
    bumpTenantCacheVersion: async (id: string) => {
      versions.set(id, (versions.get(id) ?? 0) + 1);
    },
  };
});

import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/school/schoolDashboardServerCache";
import {
  invalidateFeeListServerCaches,
  FEE_LIST_SERVER_CACHE_TTL_MS,
  getFeeCacheVersion,
  getFeeCached,
  setFeeCached,
} from "@/lib/fees/feeListServerCache";

describe("invalidateFeeListServerCaches", () => {
  const keys = (id: string) => [
    `fees:summary:stats:active:${id}`,
    `fees:summary:page:active:${id}:50:0`,
    `fees:records:v3:${id}:5000:0`,
  ];

  it("drops the fee summary/records entries for that school only", () => {
    for (const k of [...keys("s1"), ...keys("s2")]) {
      setSchoolDashboardServerCached(k, { v: 1 }, FEE_LIST_SERVER_CACHE_TTL_MS);
    }
    invalidateFeeListServerCaches("s1");
    for (const k of keys("s1")) expect(getSchoolDashboardServerCached(k)).toBeNull();
    for (const k of keys("s2")) expect(getSchoolDashboardServerCached(k)).not.toBeNull();
  });

  it("is a no-op without a schoolId", () => {
    setSchoolDashboardServerCached("fees:records:v3:s3:5000:0", { v: 1 });
    invalidateFeeListServerCaches(null);
    expect(getSchoolDashboardServerCached("fees:records:v3:s3:5000:0")).not.toBeNull();
  });
});

describe("versioned fee cache", () => {
  it("returns a cached value while the fee-data version is unchanged", () => {
    setFeeCached("fees:records:v3:v1:5000:0", { n: 1 }, 60_000, 7);
    expect(getFeeCached("fees:records:v3:v1:5000:0", 7)).toEqual({ n: 1 });
  });

  it("ignores an entry built from an older version, even if this process never purged it", () => {
    setFeeCached("fees:records:v3:v2:5000:0", { n: 1 }, 60_000, 7);
    expect(getFeeCached("fees:records:v3:v2:5000:0", 8)).toBeNull();
    // and it stays gone
    expect(getFeeCached("fees:records:v3:v2:5000:0", 7)).toBeNull();
  });

  it("bumps the school's version on invalidate so a stale entry is not served", async () => {
    const before = await getFeeCacheVersion("v3");
    setFeeCached("fees:summary:stats:active:v3", { n: 1 }, 60_000, before);
    invalidateFeeListServerCaches("v3");
    const after = await getFeeCacheVersion("v3");
    expect(after).toBeGreaterThan(before);
    expect(getFeeCached("fees:summary:stats:active:v3", after)).toBeNull();
  });

  it("does not bump another school's version", async () => {
    const other = await getFeeCacheVersion("v5");
    invalidateFeeListServerCaches("v4");
    expect(await getFeeCacheVersion("v5")).toBe(other);
  });

  it("also drops the transactions, report, extra and structure caches for that school", () => {
    const keys = [
      "fees:transactions:v6:100",
      "fees:report:v6:2026-10-18:2026-10-18:",
      "fees:extra:v6",
      "fees:structure:v6",
    ];
    for (const k of keys) setSchoolDashboardServerCached(k, { n: 1 }, 60_000);
    invalidateFeeListServerCaches("v6");
    for (const k of keys) expect(getSchoolDashboardServerCached(k)).toBeNull();
  });
});
