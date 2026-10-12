/**
 * @jest-environment node
 */
import { GET } from "@/app/api/school/analysis/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveSchoolAdminSchoolId = jest.fn();
const mockBuildSchoolAnalysisFast = jest.fn();
const mockBuildSchoolAnalysisFull = jest.fn();
const mockBuildSchoolAnalysisTables = jest.fn();
const mockGetSchoolDashboardServerCached = jest.fn();
const mockSetSchoolDashboardServerCached = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/school/resolveSchoolAdminSchoolId", () => ({
  resolveSchoolAdminSchoolId: (...args: unknown[]) => mockResolveSchoolAdminSchoolId(...args),
}));

jest.mock("@/lib/school/buildSchoolAnalysis", () => ({
  buildSchoolAnalysisFast: (...args: unknown[]) => mockBuildSchoolAnalysisFast(...args),
  buildSchoolAnalysisFull: (...args: unknown[]) => mockBuildSchoolAnalysisFull(...args),
  buildSchoolAnalysisTables: (...args: unknown[]) => mockBuildSchoolAnalysisTables(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  getSchoolDashboardServerCached: (...args: unknown[]) => mockGetSchoolDashboardServerCached(...args),
  setSchoolDashboardServerCached: (...args: unknown[]) => mockSetSchoolDashboardServerCached(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/school/analysis${query}`);
}

describe("GET /api/school/analysis", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveSchoolAdminSchoolId.mockReset();
    mockBuildSchoolAnalysisFast.mockReset();
    mockBuildSchoolAnalysisFull.mockReset();
    mockBuildSchoolAnalysisTables.mockReset();
    mockGetSchoolDashboardServerCached.mockReset();
    mockSetSchoolDashboardServerCached.mockReset();
    mockGetSchoolDashboardServerCached.mockReturnValue(null);
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

  it("uses the fast builder when fast=1", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockBuildSchoolAnalysisFast.mockResolvedValue({ fast: true });
    const res = await GET(makeRequest("?fast=1"));
    expect(res.status).toBe(200);
    expect(mockBuildSchoolAnalysisFast).toHaveBeenCalled();
  });

  it("uses the tables builder when part=tables with a valid section", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockBuildSchoolAnalysisTables.mockResolvedValue({ tables: [] });
    const res = await GET(makeRequest("?part=tables&section=fee-collection"));
    expect(res.status).toBe(200);
    expect(mockBuildSchoolAnalysisTables).toHaveBeenCalledWith("s1", expect.any(Number), null, undefined, "fee-collection");
  });

  it("uses the full builder by default", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockBuildSchoolAnalysisFull.mockResolvedValue({ full: true });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockBuildSchoolAnalysisFull).toHaveBeenCalled();
  });

  it("returns a cached payload when present", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockGetSchoolDashboardServerCached.mockReturnValue({ cached: true });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockBuildSchoolAnalysisFull).not.toHaveBeenCalled();
  });

  it("returns 500 when the builder throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockBuildSchoolAnalysisFull.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
