/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/exams/terms/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockClassFindFirst = jest.fn();
const mockClassFindMany = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockExamTermFindMany = jest.fn();
const mockExamTermCreate = jest.fn();
const mockStudentFindUnique = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: {
      findFirst: (...args: unknown[]) => mockClassFindFirst(...args),
    },
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    examTerm: {
      create: (...args: unknown[]) => mockExamTermCreate(...args),
    },
  },
}));

// GET's reads go through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md); POST still uses the plain prisma import.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      class: { findMany: (...args: unknown[]) => mockClassFindMany(...args) },
      examTerm: { findMany: (...args: unknown[]) => mockExamTermFindMany(...args) },
      student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeGetRequest(query = "") {
  return new Request(`http://localhost/api/exams/terms${query}`);
}
function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/exams/terms", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/exams/terms", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindMany.mockReset();
    mockExamTermFindMany.mockReset();
    mockStudentFindUnique.mockReset();
    mockClassFindMany.mockResolvedValue([]);
    mockExamTermFindMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res!.status).toBe(401);
  });

  it("returns 403 for a disallowed role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "PARENT", schoolId: "s1" } });
    const res = await GET(makeGetRequest());
    expect(res!.status).toBe(403);
  });

  it("returns the school's terms and classes for a teacher (same as school admin)", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "s1" } });
    mockClassFindMany.mockResolvedValue([{ id: "c1", name: "Grade 5", section: "A" }]);
    mockExamTermFindMany.mockResolvedValue([{ id: "term1", name: "TERM 1" }]);
    const res = await GET(makeGetRequest());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.terms).toHaveLength(1);
    expect(json.classes).toEqual([{ id: "c1", name: "Grade 5", section: "A" }]);
    expect(json.exams).toBeUndefined();
  });

  it("returns 400 for a student with no assigned class", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    mockStudentFindUnique.mockResolvedValue({ classId: null });
    const res = await GET(makeGetRequest());
    expect(res!.status).toBe(400);
  });

  it("returns terms scoped to the student's class", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    mockStudentFindUnique.mockResolvedValue({ classId: "c1" });
    mockExamTermFindMany.mockResolvedValue([{ id: "term1" }]);
    const res = await GET(makeGetRequest());
    expect(res!.status).toBe(200);
    expect(mockExamTermFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ classId: "c1" }) })
    );
  });

  it("returns terms and classes for a school admin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindMany.mockResolvedValue([{ id: "c1", name: "Grade 5", section: "A" }]);
    mockExamTermFindMany.mockResolvedValue([{ id: "term1" }]);
    const res = await GET(makeGetRequest());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.classes).toHaveLength(1);
    expect(json.terms).toHaveLength(1);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest());
    expect(res!.status).toBe(500);
  });
});

describe("POST /api/exams/terms", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTermCreate.mockReset();
  });

  it("returns 403 for a disallowed role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await POST(makePostRequest({ name: "Term 1", classId: "c1" }));
    expect(res!.status).toBe(403);
  });

  it("returns 400 when name or classId is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await POST(makePostRequest({ name: "Term 1" }));
    expect(res!.status).toBe(400);
  });

  it("creates the exam term", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermCreate.mockResolvedValue({ id: "term1", name: "Term 1" });
    const res = await POST(makePostRequest({ name: "Term 1", classId: "c1" }));
    expect(res!.status).toBe(201);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermCreate.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makePostRequest({ name: "Term 1", classId: "c1" }));
    expect(res!.status).toBe(500);
  });
});
