/**
 * @jest-environment node
 */
import { GET } from "@/app/api/school/analysis/fees-comparison/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveSchoolAdminSchoolId = jest.fn();
const mockBuildFeesComparisonReport = jest.fn();
const mockGetCached = jest.fn();
const mockSetCached = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/school/resolveSchoolAdminSchoolId", () => ({
  resolveSchoolAdminSchoolId: (...args: unknown[]) => mockResolveSchoolAdminSchoolId(...args),
}));

jest.mock("@/lib/fees/buildFeesComparisonReport", () => ({
  buildFeesComparisonReport: (...args: unknown[]) => mockBuildFeesComparisonReport(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  getSchoolDashboardServerCached: (...args: unknown[]) => mockGetCached(...args),
  setSchoolDashboardServerCached: (...args: unknown[]) => mockSetCached(...args),
}));

const request = (query = "") => new Request(`http://localhost/api/school/analysis/fees-comparison${query}`);

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("GET /api/school/analysis/fees-comparison", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveSchoolAdminSchoolId.mockReset();
    mockBuildFeesComparisonReport.mockReset();
    mockGetCached.mockReset().mockReturnValue(null);
    mockSetCached.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns the error/status from resolveSchoolAdminSchoolId when it fails", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ error: "School not found", status: 400 });
    const res = await GET(request());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe("School not found");
  });

  it("returns a cached report without recomputing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockGetCached.mockReturnValue({ rangeA: { total: 100 } });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ rangeA: { total: 100 } });
    expect(mockBuildFeesComparisonReport).not.toHaveBeenCalled();
  });

  it("builds and caches a fresh report keyed by school and date ranges", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockBuildFeesComparisonReport.mockResolvedValue({ rangeA: { total: 200 } });

    const res = await GET(
      request("?rangeAFrom=2024-01-01&rangeATo=2024-01-31&rangeBFrom=2023-01-01&rangeBTo=2023-01-31")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ rangeA: { total: 200 } });

    expect(mockBuildFeesComparisonReport).toHaveBeenCalledWith("s1", {
      rangeAFrom: "2024-01-01",
      rangeATo: "2024-01-31",
      rangeBFrom: "2023-01-01",
      rangeBTo: "2023-01-31",
    });
    expect(mockSetCached).toHaveBeenCalledWith(
      "analysis:fees-comparison:s1:2024-01-01:2024-01-31:2023-01-01:2023-01-31",
      { rangeA: { total: 200 } },
      60_000
    );
  });

  it("returns 500 when the report builder throws", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockBuildFeesComparisonReport.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
