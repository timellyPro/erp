/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/teacher-audit/[teacherId]/records/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockUserFindFirst = jest.fn();
const mockRecordFindMany = jest.fn();
const mockAggregate = jest.fn();
const mockRecordCreate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    user: { findFirst: (...args: unknown[]) => mockUserFindFirst(...args) },
    teacherAuditRecord: {
      findMany: (...args: unknown[]) => mockRecordFindMany(...args),
      aggregate: (...args: unknown[]) => mockAggregate(...args),
      create: (...args: unknown[]) => mockRecordCreate(...args),
    },
  },
}));

function makeGetRequest(query = "") {
  return new Request(`http://localhost/api/teacher-audit/t1/records${query}`);
}
function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/teacher-audit/t1/records", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ teacherId: "t1" });

describe("GET /api/teacher-audit/[teacherId]/records", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserFindFirst.mockReset();
    mockRecordFindMany.mockReset();
    mockAggregate.mockReset();
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

  it("returns 404 when the teacher isn't found in the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns records with a computed performance score", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindFirst.mockResolvedValue({ id: "t1" });
    mockRecordFindMany.mockResolvedValue([{ id: "r1" }]);
    mockAggregate.mockResolvedValue({ _sum: { scoreImpact: -20 }, _count: { _all: 1 } });
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.performanceScore).toBe(30);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/teacher-audit/[teacherId]/records", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserFindFirst.mockReset();
    mockAggregate.mockReset();
    mockRecordCreate.mockReset();
  });

  it("returns 404 when the teacher isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindFirst.mockResolvedValue(null);
    const res = await POST(makePostRequest({ scoreImpact: 5 }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when category is CUSTOM without customCategory", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindFirst.mockResolvedValue({ id: "t1" });
    const res = await POST(makePostRequest({ scoreImpact: 5 }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-numeric scoreImpact", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindFirst.mockResolvedValue({ id: "t1" });
    const res = await POST(makePostRequest({ customCategory: "Punctuality", scoreImpact: "bad" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the resulting score would exceed 100", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindFirst.mockResolvedValue({ id: "t1" });
    mockAggregate.mockResolvedValue({ _sum: { scoreImpact: 45 } });
    const res = await POST(makePostRequest({ customCategory: "Excellence", scoreImpact: 10 }), { params });
    expect(res.status).toBe(400);
  });

  it("creates the audit record", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindFirst.mockResolvedValue({ id: "t1" });
    mockAggregate.mockResolvedValue({ _sum: { scoreImpact: 0 } });
    mockRecordCreate.mockResolvedValue({ id: "rec1" });
    const res = await POST(
      makePostRequest({ customCategory: "Punctuality", description: "Late twice", scoreImpact: -5 }),
      { params }
    );
    expect(res.status).toBe(201);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makePostRequest({ customCategory: "X", scoreImpact: 1 }), { params });
    expect(res.status).toBe(500);
  });
});
