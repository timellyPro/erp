/**
 * @jest-environment node
 */
import { POST } from "@/app/api/class/create/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockRequireSchoolId = jest.fn();
const mockUserFindFirst = jest.fn();
const mockClassCreate = jest.fn();
const mockPurgeCache = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/auth/tenant", () => ({
  requireSchoolId: (...args: unknown[]) => mockRequireSchoolId(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  purgeSchoolDashboardServerCacheMatching: (...args: unknown[]) => mockPurgeCache(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: { findFirst: (...args: unknown[]) => mockUserFindFirst(...args) },
    class: { create: (...args: unknown[]) => mockClassCreate(...args) },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/class/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/class/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockRequireSchoolId.mockReset();
    mockUserFindFirst.mockReset();
    mockClassCreate.mockReset();
    mockPurgeCache.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-staff role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(403);
  });

  it("returns the requireSchoolId error status when it fails", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockRequireSchoolId.mockResolvedValue({ ok: false, status: 400, message: "School not found in session" });
    const res = await POST(makeRequest({ name: "Grade 5" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when class name is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the given teacher doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    mockUserFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({ name: "Grade 5", teacherId: "t1" }));
    expect(res.status).toBe(400);
  });

  it("creates the class and purges the dashboard cache", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    mockClassCreate.mockResolvedValue({ id: "c1", name: "Grade 5" });
    const res = await POST(makeRequest({ name: "Grade 5" }));
    expect(res.status).toBe(201);
    expect(mockPurgeCache).toHaveBeenCalledWith("class:list:lite:s1");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    mockClassCreate.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ name: "Grade 5" }));
    expect(res.status).toBe(500);
  });
});
