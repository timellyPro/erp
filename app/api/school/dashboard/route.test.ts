/**
 * @jest-environment node
 */
import { GET } from "@/app/api/school/dashboard/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveSchoolAdminSchoolId = jest.fn();
const mockBuildSchoolDashboardFast = jest.fn();
const mockGetSchoolDashboardServerCached = jest.fn();
const mockSetSchoolDashboardServerCached = jest.fn();
const mockGetSchoolDashboardFeeTotals = jest.fn();
const mockBuildSchoolDashboardCollectionSummary = jest.fn();
const mockClassCount = jest.fn();
const mockStudentCount = jest.fn();
const mockUserCount = jest.fn();
const mockQueryRaw = jest.fn();
const mockLeaveRequestFindMany = jest.fn();
const mockNewsFeedFindMany = jest.fn();
const mockPurgeExpiredNewsFeeds = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/school/resolveSchoolAdminSchoolId", () => ({
  resolveSchoolAdminSchoolId: (...args: unknown[]) => mockResolveSchoolAdminSchoolId(...args),
}));

jest.mock("@/lib/school/buildSchoolDashboardFast", () => ({
  buildSchoolDashboardFast: (...args: unknown[]) => mockBuildSchoolDashboardFast(...args),
}));

jest.mock("@/lib/school/buildSchoolDashboardCollection", () => ({
  buildSchoolDashboardCollectionSummary: (...args: unknown[]) => mockBuildSchoolDashboardCollectionSummary(...args),
}));

jest.mock("@/lib/fees/schoolDashboardFeeTotals", () => ({
  getSchoolDashboardFeeTotals: (...args: unknown[]) => mockGetSchoolDashboardFeeTotals(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  getSchoolDashboardServerCached: (...args: unknown[]) => mockGetSchoolDashboardServerCached(...args),
  setSchoolDashboardServerCached: (...args: unknown[]) => mockSetSchoolDashboardServerCached(...args),
}));

jest.mock("@/lib/newsfeedRetention", () => ({
  purgeExpiredNewsFeeds: (...args: unknown[]) => mockPurgeExpiredNewsFeeds(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { count: (...args: unknown[]) => mockClassCount(...args) },
    student: { count: (...args: unknown[]) => mockStudentCount(...args) },
    user: { count: (...args: unknown[]) => mockUserCount(...args) },
    leaveRequest: { findMany: (...args: unknown[]) => mockLeaveRequestFindMany(...args) },
    newsFeed: { findMany: (...args: unknown[]) => mockNewsFeedFindMany(...args) },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/school/dashboard${query}`);
}

describe("GET /api/school/dashboard", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveSchoolAdminSchoolId.mockReset();
    mockBuildSchoolDashboardFast.mockReset();
    mockGetSchoolDashboardServerCached.mockReset();
    mockSetSchoolDashboardServerCached.mockReset();
    mockGetSchoolDashboardFeeTotals.mockReset();
    mockBuildSchoolDashboardCollectionSummary.mockReset();
    mockClassCount.mockReset();
    mockStudentCount.mockReset();
    mockUserCount.mockReset();
    mockQueryRaw.mockReset();
    mockLeaveRequestFindMany.mockReset();
    mockNewsFeedFindMany.mockReset();
    mockPurgeExpiredNewsFeeds.mockReset();

    mockGetSchoolDashboardServerCached.mockReturnValue(null);
    mockClassCount.mockResolvedValue(0);
    mockStudentCount.mockResolvedValue(0);
    mockUserCount.mockResolvedValue(0);
    mockQueryRaw.mockResolvedValue([]);
    mockLeaveRequestFindMany.mockResolvedValue([]);
    mockNewsFeedFindMany.mockResolvedValue([]);
    mockGetSchoolDashboardFeeTotals.mockResolvedValue({ totalPaid: 0, totalFee: 0 });
    mockBuildSchoolDashboardCollectionSummary.mockResolvedValue({
      todayCollectionTotal: "₹0",
      todayCollectionTotalRaw: 0,
      todayCollectionByMethod: [],
      collectionDate: "2026-01-01",
    });
    mockPurgeExpiredNewsFeeds.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns the resolveSchoolAdminSchoolId error status when it fails", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ error: "School not found", status: 400 });
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns fast-only payload when fast=1", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockBuildSchoolDashboardFast.mockResolvedValue({ fast: true });
    const res = await GET(makeRequest("?fast=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fast).toBe(true);
  });

  it("returns a cached payload when present", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockGetSchoolDashboardServerCached.mockReturnValue({ cached: true });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockClassCount).not.toHaveBeenCalled();
  });

  it("aggregates the full dashboard payload on a cache miss", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockClassCount.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
    mockStudentCount.mockResolvedValueOnce(50).mockResolvedValueOnce(40);
    mockUserCount.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats.totalClasses).toBe(5);
    expect(json.stats.totalClassesChange).toBe(2);
    expect(mockSetSchoolDashboardServerCached).toHaveBeenCalled();
  });

  it("returns 503 for a database connection error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockRejectedValue({ code: "P1001", message: "Can't reach database server" });
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns 500 for a generic error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockRejectedValue(new Error("boom"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
