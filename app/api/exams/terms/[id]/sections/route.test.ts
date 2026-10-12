/**
 * @jest-environment node
 */
import { GET, PUT } from "@/app/api/exams/terms/[id]/sections/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockExamTermFindFirst = jest.fn();
const mockExamTermSectionFindMany = jest.fn();
const mockTransaction = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: jest.fn() },
    school: { findFirst: jest.fn() },
    examTerm: { findFirst: (...args: unknown[]) => mockExamTermFindFirst(...args) },
    examTermSection: { findMany: (...args: unknown[]) => mockExamTermSectionFindMany(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// GET's read goes through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md); PUT still uses the plain prisma import.
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
  return new Request("http://localhost/api/exams/terms/term1/sections");
}
function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/exams/terms/term1/sections", { method: "PUT", body: JSON.stringify(body) });
}
const params = Promise.resolve({ id: "term1" });

describe("GET /api/exams/terms/[id]/sections", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTermFindFirst.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the term isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns the term's sections", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1", name: "Midterm", sections: [{ id: "sec1" }] });
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/exams/terms/[id]/sections", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTermFindFirst.mockReset();
    mockExamTermSectionFindMany.mockReset();
    mockTransaction.mockReset();
    mockTransaction.mockResolvedValue(undefined);
  });

  it("returns 403 for a role that is neither school admin nor teacher", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await PUT(makePutRequest({}), { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the term isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ sections: [] }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when sections isn't an array", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1", name: "Midterm" });
    const res = await PUT(makePutRequest({}), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 for duplicate section names", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1", name: "Midterm" });
    const res = await PUT(
      makePutRequest({ sections: [{ name: "A", maxMarks: 10 }, { name: "a", maxMarks: 5 }] }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("replaces the term's sections", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1", name: "Midterm" });
    mockExamTermSectionFindMany.mockResolvedValue([{ id: "sec1", name: "A", maxMarks: 10 }]);
    const res = await PUT(makePutRequest({ sections: [{ name: "A", maxMarks: 10 }] }), { params });
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(makePutRequest({ sections: [] }), { params });
    expect(res.status).toBe(500);
  });
});
