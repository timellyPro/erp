/**
 * @jest-environment node
 */
import { GET, POST, PATCH, DELETE } from "@/app/api/exam-types/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockClassFindFirst = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockExamTypeFindMany = jest.fn();
const mockExamTypeFindFirst = jest.fn();
const mockExamTypeCreate = jest.fn();
const mockExamTypeUpdate = jest.fn();
const mockExamTypeDeleteMany = jest.fn();
const mockMarkFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    examType: {
      findMany: (...args: unknown[]) => mockExamTypeFindMany(...args),
      findFirst: (...args: unknown[]) => mockExamTypeFindFirst(...args),
      create: (...args: unknown[]) => mockExamTypeCreate(...args),
      update: (...args: unknown[]) => mockExamTypeUpdate(...args),
      deleteMany: (...args: unknown[]) => mockExamTypeDeleteMany(...args),
    },
    mark: { findMany: (...args: unknown[]) => mockMarkFindMany(...args) },
  },
}));

// GET's reads go through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md); simulate that transaction wrapper, backed by
// the same mocks used elsewhere in this file (POST/PATCH/DELETE still use
// the plain prisma import, since writes haven't migrated yet).
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      examType: { findMany: (...args: unknown[]) => mockExamTypeFindMany(...args) },
      mark: { findMany: (...args: unknown[]) => mockMarkFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest(body?: unknown, query = "") {
  return new Request(`http://localhost/api/exam-types${query}`, {
    method: body !== undefined ? "POST" : "GET",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("GET /api/exam-types", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTypeFindMany.mockReset();
    mockMarkFindMany.mockReset();
    mockExamTypeFindMany.mockResolvedValue([]);
    mockMarkFindMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a disallowed role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "PARENT", schoolId: "s1" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns default exam types merged with custom ones", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindMany.mockResolvedValue([{ name: "MIDTERM", maxMarks: 50, sections: [] }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    const names = json.examTypes.map((t: { name: string }) => t.name);
    expect(names).toContain("TERM 1");
    expect(names).toContain("MIDTERM");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/exam-types", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTypeFindFirst.mockReset();
    mockExamTypeCreate.mockReset();
  });

  it("returns 403 for a role that is neither school admin nor teacher", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await POST(makeRequest({ name: "Midterm" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-positive maxMarks", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await POST(makeRequest({ name: "Midterm", maxMarks: -5 }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when the exam type already exists", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindFirst.mockResolvedValue({ id: "et1" });
    const res = await POST(makeRequest({ name: "Midterm" }));
    expect(res.status).toBe(409);
  });

  it("creates the exam type", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindFirst.mockResolvedValue(null);
    mockExamTypeCreate.mockResolvedValue({ id: "et1", name: "MIDTERM" });
    const res = await POST(makeRequest({ name: "Midterm", maxMarks: 50 }));
    expect(res.status).toBe(201);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ name: "Midterm" }));
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/exam-types", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTypeFindFirst.mockReset();
    mockExamTypeUpdate.mockReset();
    mockExamTypeCreate.mockReset();
  });

  it("returns 400 when maxMarks is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await PATCH(makeRequest({ name: "Midterm" }));
    expect(res.status).toBe(400);
  });

  it("updates an existing exam type", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindFirst.mockResolvedValue({ id: "et1" });
    mockExamTypeUpdate.mockResolvedValue({ id: "et1", maxMarks: 60 });
    const res = await PATCH(makeRequest({ name: "Midterm", maxMarks: 60 }));
    expect(res.status).toBe(200);
    expect(mockExamTypeUpdate).toHaveBeenCalled();
  });

  it("creates a default-name exam type row if none existed", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindFirst.mockResolvedValue(null);
    mockExamTypeCreate.mockResolvedValue({ id: "et1", maxMarks: 60 });
    const res = await PATCH(makeRequest({ name: "TERM 1", maxMarks: 60 }));
    expect(res.status).toBe(200);
    expect(mockExamTypeCreate).toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH(makeRequest({ name: "Midterm", maxMarks: 60 }));
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/exam-types", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTypeFindMany.mockReset();
    mockExamTypeDeleteMany.mockReset();
  });

  it("returns 404 when the exam type doesn't exist in the custom catalog", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindMany.mockResolvedValue([]);
    const res = await DELETE(makeRequest(undefined, "?name=Midterm"));
    expect(res.status).toBe(404);
  });

  it("rejects deleting a default exam type", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindMany.mockResolvedValue([{ name: "TERM 1" }]);
    const res = await DELETE(makeRequest(undefined, "?name=TERM 1"));
    expect(res.status).toBe(400);
  });

  it("deletes a custom exam type", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindMany.mockResolvedValue([{ name: "MIDTERM" }]);
    mockExamTypeDeleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(makeRequest(undefined, "?name=Midterm"));
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await DELETE(makeRequest(undefined, "?name=Midterm"));
    expect(res.status).toBe(500);
  });
});
