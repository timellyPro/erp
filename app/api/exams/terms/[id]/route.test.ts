/**
 * @jest-environment node
 */
import { GET, PUT } from "@/app/api/exams/terms/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockClassFindFirst = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockExamTermFindFirst = jest.fn();
const mockExamTermUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    examTerm: {
      findFirst: (...args: unknown[]) => mockExamTermFindFirst(...args),
      update: (...args: unknown[]) => mockExamTermUpdate(...args),
    },
  },
}));

// GET's reads go through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md); PUT still uses the plain prisma import for
// its own findFirst call.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      examTerm: { findFirst: (...args: unknown[]) => mockExamTermFindFirst(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeGetRequest() {
  return new Request("http://localhost/api/exams/terms/term1");
}
function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/exams/terms/term1", { method: "PUT", body: JSON.stringify(body) });
}
const params = Promise.resolve({ id: "term1" });

describe("GET /api/exams/terms/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTermFindFirst.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a disallowed role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the term isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns the term", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/exams/terms/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindFirst.mockReset();
    mockExamTermFindFirst.mockReset();
    mockExamTermUpdate.mockReset();
  });

  it("returns 404 when the term isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ name: "Updated" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the new classId doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ classId: "c2" }), { params });
    expect(res.status).toBe(404);
  });

  it("updates the term", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    mockExamTermUpdate.mockResolvedValue({ id: "term1", name: "Updated" });
    const res = await PUT(makePutRequest({ name: "Updated", status: "COMPLETED" }), { params });
    expect(res.status).toBe(200);
    expect(mockExamTermUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Updated", status: "COMPLETED" }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(makePutRequest({ name: "Updated" }), { params });
    expect(res.status).toBe(500);
  });
});
