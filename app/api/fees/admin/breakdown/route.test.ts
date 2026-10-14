/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/admin/breakdown/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockClassFindFirst = jest.fn();
const mockComputeAdminStudentFeeBreakdown = jest.fn();
const mockIsRedisEnabled = jest.fn();
const mockGetBreakdownMemCached = jest.fn();
const mockSetBreakdownMemCached = jest.fn();
const mockTenantCacheKey = jest.fn();
const mockSwrGet = jest.fn();
const mockSwrSet = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/computeAdminStudentFeeBreakdown", () => ({
  computeAdminStudentFeeBreakdown: (...args: unknown[]) => mockComputeAdminStudentFeeBreakdown(...args),
}));

jest.mock("@/lib/cache/redis", () => ({
  isRedisEnabled: (...args: unknown[]) => mockIsRedisEnabled(...args),
}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  getBreakdownMemCached: (...args: unknown[]) => mockGetBreakdownMemCached(...args),
  setBreakdownMemCached: (...args: unknown[]) => mockSetBreakdownMemCached(...args),
}));

jest.mock("@/lib/cache/tenantCache", () => ({
  tenantCacheKey: (...args: unknown[]) => mockTenantCacheKey(...args),
  swrGet: (...args: unknown[]) => mockSwrGet(...args),
  swrSet: (...args: unknown[]) => mockSwrSet(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
  },
}));

const request = (query = "") => new Request(`http://localhost/api/fees/admin/breakdown${query}`);

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("GET /api/fees/admin/breakdown", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockClassFindFirst.mockReset();
    mockComputeAdminStudentFeeBreakdown.mockReset();
    mockIsRedisEnabled.mockReset().mockReturnValue(false);
    mockGetBreakdownMemCached.mockReset().mockReturnValue(null);
    mockSetBreakdownMemCached.mockReset();
    mockTenantCacheKey.mockReset();
    mockSwrGet.mockReset();
    mockSwrSet.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request("?studentId=stu1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot view fee breakdowns", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET(request("?studentId=stu1"));
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    mockClassFindFirst.mockResolvedValue(null);
    const res = await GET(request("?studentId=stu1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when studentId is missing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns a cached fast breakdown without recomputing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetBreakdownMemCached.mockReturnValue({ finalFee: 900 });
    const res = await GET(request("?studentId=stu1&fast=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ finalFee: 900 });
    expect(mockComputeAdminStudentFeeBreakdown).not.toHaveBeenCalled();
  });

  it("bypasses the mem cache when refresh=1 is set even on the fast path", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetBreakdownMemCached.mockReturnValue({ finalFee: 900 });
    mockComputeAdminStudentFeeBreakdown.mockResolvedValue({ finalFee: 950 });
    const res = await GET(request("?studentId=stu1&fast=1&refresh=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ finalFee: 950 });
    expect(mockGetBreakdownMemCached).not.toHaveBeenCalled();
  });

  it("computes with migration/reconciliation enabled on the slow (default) path", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockComputeAdminStudentFeeBreakdown.mockResolvedValue({ finalFee: 900 });
    const res = await GET(request("?studentId=stu1"));
    expect(res.status).toBe(200);
    expect(mockComputeAdminStudentFeeBreakdown).toHaveBeenCalledWith("s1", "stu1", {
      migrateLumps: true,
      cleanupHostelMessDuplicates: true,
      reconcileTotals: true,
    });
    expect(mockSetBreakdownMemCached).not.toHaveBeenCalled();
  });

  it("computes with migration/reconciliation disabled and caches the result on the fast path", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockComputeAdminStudentFeeBreakdown.mockResolvedValue({ finalFee: 900 });
    const res = await GET(request("?studentId=stu1&fast=1"));
    expect(res.status).toBe(200);
    expect(mockComputeAdminStudentFeeBreakdown).toHaveBeenCalledWith("s1", "stu1", {
      migrateLumps: false,
      cleanupHostelMessDuplicates: false,
      reconcileTotals: false,
    });
    expect(mockSetBreakdownMemCached).toHaveBeenCalledWith("s1:stu1:fast", { finalFee: 900 });
  });

  it("uses the Redis SWR cache on the fast path when Redis is enabled", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockIsRedisEnabled.mockReturnValue(true);
    mockTenantCacheKey.mockResolvedValue("cache-key-1");
    mockSwrGet.mockResolvedValue(null);
    mockComputeAdminStudentFeeBreakdown.mockResolvedValue({ finalFee: 900 });

    const res = await GET(request("?studentId=stu1&fast=1"));
    expect(res.status).toBe(200);
    expect(mockSwrGet).toHaveBeenCalledWith("cache-key-1");
    expect(mockSwrSet).toHaveBeenCalledWith(
      "cache-key-1",
      expect.objectContaining({ value: { finalFee: 900 } }),
      20
    );
  });

  it("returns a fresh Redis-cached value without recomputing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockIsRedisEnabled.mockReturnValue(true);
    mockTenantCacheKey.mockResolvedValue("cache-key-1");
    mockSwrGet.mockResolvedValue({ value: { finalFee: 777 }, freshUntil: Date.now() + 60_000 });

    const res = await GET(request("?studentId=stu1&fast=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ finalFee: 777 });
    expect(mockComputeAdminStudentFeeBreakdown).not.toHaveBeenCalled();
  });

  it("returns 404 when the fee record is not found", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockComputeAdminStudentFeeBreakdown.mockRejectedValue(new Error("Fee record not found"));
    const res = await GET(request("?studentId=stu1"));
    expect(res.status).toBe(404);
  });

  it("returns 500 for an unrelated failure", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockComputeAdminStudentFeeBreakdown.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request("?studentId=stu1"));
    expect(res.status).toBe(500);
  });
});
