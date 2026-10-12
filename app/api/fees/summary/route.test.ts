/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/summary/route";
import { FEE_LIST_SERVER_CACHE_TTL_MS } from "@/lib/fees/feeListServerCache";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockComputeCurrentAndPreviousFeeStats = jest.fn();
const mockLoadFeeSummaryPage = jest.fn();
const mockGetSchoolDashboardServerCached = jest.fn();
const mockSetSchoolDashboardServerCached = jest.fn();
const mockTenantCacheKey = jest.fn();
const mockSwrGet = jest.fn();
const mockSwrSet = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/fees/computeFeeSummaryStats", () => ({
  computeCurrentAndPreviousFeeStats: (...args: unknown[]) => mockComputeCurrentAndPreviousFeeStats(...args),
}));

jest.mock("@/lib/fees/loadFeeSummaryPage", () => ({
  loadFeeSummaryPage: (...args: unknown[]) => mockLoadFeeSummaryPage(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  getSchoolDashboardServerCached: (...args: unknown[]) => mockGetSchoolDashboardServerCached(...args),
  setSchoolDashboardServerCached: (...args: unknown[]) => mockSetSchoolDashboardServerCached(...args),
}));

jest.mock("@/lib/cache/tenantCache", () => ({
  tenantCacheKey: (...args: unknown[]) => mockTenantCacheKey(...args),
  swrGet: (...args: unknown[]) => mockSwrGet(...args),
  swrSet: (...args: unknown[]) => mockSwrSet(...args),
}));

const request = (query = "") => new Request(`http://localhost/api/fees/summary${query}`);

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("GET /api/fees/summary", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockComputeCurrentAndPreviousFeeStats.mockReset();
    mockLoadFeeSummaryPage.mockReset();
    mockGetSchoolDashboardServerCached.mockReset().mockReturnValue(null);
    mockSetSchoolDashboardServerCached.mockReset();
    mockTenantCacheKey.mockReset().mockResolvedValue("cache-key-1");
    mockSwrGet.mockReset().mockResolvedValue(null);
    mockSwrSet.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot view the fee summary", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns cached stats without recomputing on the statsOnly path", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockGetSchoolDashboardServerCached.mockReturnValue({ fees: [], stats: { totalDue: 100 }, nextCursor: null });
    const res = await GET(request("?statsOnly=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats.totalDue).toBe(100);
    expect(mockComputeCurrentAndPreviousFeeStats).not.toHaveBeenCalled();
  });

  it("computes and caches fresh stats on the statsOnly path when nothing is cached", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockComputeCurrentAndPreviousFeeStats.mockResolvedValue({ totalDue: 250 });
    const res = await GET(request("?statsOnly=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats.totalDue).toBe(250);
    expect(json.fees).toEqual([]);
    expect(json.nextCursor).toBeNull();
    expect(mockSetSchoolDashboardServerCached).toHaveBeenCalledWith(
      "fees:summary:stats:active:s1",
      expect.objectContaining({ stats: { totalDue: 250 } }),
      FEE_LIST_SERVER_CACHE_TTL_MS
    );
  });

  it("returns a cached page without querying the database", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockGetSchoolDashboardServerCached.mockReturnValue({ fees: [{ id: "cached" }], stats: {}, nextCursor: null });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fees).toEqual([{ id: "cached" }]);
    expect(mockLoadFeeSummaryPage).not.toHaveBeenCalled();
  });

  it("returns a fresh SWR-cached page without recomputing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockSwrGet.mockResolvedValue({
      value: { fees: [{ id: "swr" }], stats: {}, nextCursor: null },
      freshUntil: Date.now() + 60_000,
    });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fees).toEqual([{ id: "swr" }]);
    expect(json.cache).toBe("fresh");
    expect(mockLoadFeeSummaryPage).not.toHaveBeenCalled();
  });

  it("loads a fresh page and populates both caches when nothing is cached", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockLoadFeeSummaryPage.mockResolvedValue({ fees: [{ id: "fresh" }], stats: {}, nextCursor: "cur1" });

    const res = await GET(request("?take=25&cursor=abc"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fees).toEqual([{ id: "fresh" }]);
    expect(json.nextCursor).toBe("cur1");
    expect(mockLoadFeeSummaryPage).toHaveBeenCalledWith("s1", 25, "abc");
    expect(mockSetSchoolDashboardServerCached).toHaveBeenCalled();
    expect(mockSwrSet).toHaveBeenCalled();
  });

  it("clamps take to a maximum of 100", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockLoadFeeSummaryPage.mockResolvedValue({ fees: [], stats: {}, nextCursor: null });
    const res = await GET(request("?take=99999"));
    expect(res.status).toBe(200);
    expect(mockLoadFeeSummaryPage).toHaveBeenCalledWith("s1", 100, null);
  });

  it("returns 500 when an unexpected error is thrown", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockLoadFeeSummaryPage.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
