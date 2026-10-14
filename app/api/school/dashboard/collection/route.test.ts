/**
 * @jest-environment node
 */
import { GET } from "@/app/api/school/dashboard/collection/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveSchoolAdminSchoolId = jest.fn();
const mockBuildSchoolDashboardCollection = jest.fn();
const mockBuildSchoolDashboardCollectionByHead = jest.fn();
const mockBuildSchoolDashboardCollectionSummary = jest.fn();
const mockGetSchoolDashboardServerCached = jest.fn();
const mockSetSchoolDashboardServerCached = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/school/resolveSchoolAdminSchoolId", () => ({
  resolveSchoolAdminSchoolId: (...args: unknown[]) => mockResolveSchoolAdminSchoolId(...args),
}));

jest.mock("@/lib/school/buildSchoolDashboardCollection", () => ({
  buildSchoolDashboardCollection: (...args: unknown[]) => mockBuildSchoolDashboardCollection(...args),
  buildSchoolDashboardCollectionByHead: (...args: unknown[]) => mockBuildSchoolDashboardCollectionByHead(...args),
  buildSchoolDashboardCollectionSummary: (...args: unknown[]) => mockBuildSchoolDashboardCollectionSummary(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  getSchoolDashboardServerCached: (...args: unknown[]) => mockGetSchoolDashboardServerCached(...args),
  setSchoolDashboardServerCached: (...args: unknown[]) => mockSetSchoolDashboardServerCached(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/school/dashboard/collection${query}`);
}

describe("GET /api/school/dashboard/collection", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveSchoolAdminSchoolId.mockReset();
    mockBuildSchoolDashboardCollection.mockReset();
    mockBuildSchoolDashboardCollectionByHead.mockReset();
    mockBuildSchoolDashboardCollectionSummary.mockReset();
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

  it("uses the summary builder for part=summary", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockBuildSchoolDashboardCollectionSummary.mockResolvedValue({ total: 100 });
    const res = await GET(makeRequest("?part=summary"));
    expect(res.status).toBe(200);
    expect(mockBuildSchoolDashboardCollectionSummary).toHaveBeenCalled();
  });

  it("uses the heads builder for part=heads", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockBuildSchoolDashboardCollectionByHead.mockResolvedValue({ heads: [] });
    const res = await GET(makeRequest("?part=heads"));
    expect(res.status).toBe(200);
    expect(mockBuildSchoolDashboardCollectionByHead).toHaveBeenCalled();
  });

  it("uses the full builder by default", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockBuildSchoolDashboardCollection.mockResolvedValue({ full: true });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockBuildSchoolDashboardCollection).toHaveBeenCalled();
  });

  it("returns a cached payload when present", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockGetSchoolDashboardServerCached.mockReturnValue({ cached: true });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockBuildSchoolDashboardCollection).not.toHaveBeenCalled();
  });

  it("returns 500 when the builder throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "s1" });
    mockBuildSchoolDashboardCollection.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
