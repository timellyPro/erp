import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/school/schoolDashboardServerCache";
import { invalidateFeeListServerCaches, FEE_LIST_SERVER_CACHE_TTL_MS } from "@/lib/fees/feeListServerCache";

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
