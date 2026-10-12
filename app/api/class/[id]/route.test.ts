/**
 * @jest-environment node
 */
import { GET, PUT, DELETE } from "@/app/api/class/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockClassFindFirst = jest.fn();
const mockUserFindFirst = jest.fn();
const mockClassUpdate = jest.fn();
const mockClassDelete = jest.fn();
const mockPurgeCache = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  purgeSchoolDashboardServerCacheMatching: (...args: unknown[]) => mockPurgeCache(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: {
      findFirst: (...args: unknown[]) => mockClassFindFirst(...args),
      update: (...args: unknown[]) => mockClassUpdate(...args),
      delete: (...args: unknown[]) => mockClassDelete(...args),
    },
    user: { findFirst: (...args: unknown[]) => mockUserFindFirst(...args) },
  },
}));

// GET's read goes through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md); PUT/DELETE still use the plain prisma import.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeGetRequest() {
  return new Request("http://localhost/api/class/c1");
}
function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/class/c1", { method: "PUT", body: JSON.stringify(body) });
}
function makeDeleteRequest() {
  return new Request("http://localhost/api/class/c1", { method: "DELETE" });
}

const params = Promise.resolve({ id: "c1" });

describe("GET /api/class/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockClassFindFirst.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the class isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockClassFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns the class", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockClassFindFirst.mockResolvedValue({ id: "c1", name: "Grade 5" });
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockClassFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/class/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindFirst.mockReset();
    mockUserFindFirst.mockReset();
    mockClassUpdate.mockReset();
    mockPurgeCache.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(makePutRequest({}), { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await PUT(makePutRequest({}), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the class isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ name: "New" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when the given teacher doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1", name: "Grade 5", section: "A", teacherId: null });
    mockUserFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ teacherId: "t1" }), { params });
    expect(res.status).toBe(400);
  });

  it("updates the class and purges the cache", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1", name: "Grade 5", section: "A", teacherId: null });
    mockClassUpdate.mockResolvedValue({ id: "c1", name: "Grade 6" });
    const res = await PUT(makePutRequest({ name: "Grade 6" }), { params });
    expect(res.status).toBe(200);
    expect(mockPurgeCache).toHaveBeenCalledWith("class:list:lite:s1");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(makePutRequest({ name: "Grade 6" }), { params });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/class/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindFirst.mockReset();
    mockClassDelete.mockReset();
    mockPurgeCache.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the class isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when the class still has students", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1", _count: { students: 3 } });
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(400);
    expect(mockClassDelete).not.toHaveBeenCalled();
  });

  it("deletes an empty class and purges the cache", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1", _count: { students: 0 } });
    mockClassDelete.mockResolvedValue({ id: "c1" });
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(200);
    expect(mockPurgeCache).toHaveBeenCalledWith("class:list:lite:s1");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(500);
  });
});
