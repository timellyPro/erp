/**
 * @jest-environment node
 */
import { GET, POST, PATCH, DELETE } from "@/app/api/exam-subjects/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockClassFindFirst = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockExamSubjectFindMany = jest.fn();
const mockExamSubjectFindFirst = jest.fn();
const mockExamSubjectCreate = jest.fn();
const mockExamSubjectUpdate = jest.fn();
const mockExamSubjectDeleteMany = jest.fn();
const mockQueryRaw = jest.fn();
const mockExecuteRaw = jest.fn();
const mockExecuteRawUnsafe = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    examSubject: {
      findMany: (...args: unknown[]) => mockExamSubjectFindMany(...args),
      findFirst: (...args: unknown[]) => mockExamSubjectFindFirst(...args),
      create: (...args: unknown[]) => mockExamSubjectCreate(...args),
      update: (...args: unknown[]) => mockExamSubjectUpdate(...args),
      deleteMany: (...args: unknown[]) => mockExamSubjectDeleteMany(...args),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
  },
}));

function makeRequest(body?: unknown, query = "") {
  return new Request(`http://localhost/api/exam-subjects${query}`, {
    method: body !== undefined ? "POST" : "GET",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("GET /api/exam-subjects", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamSubjectFindMany.mockReset();
    mockQueryRaw.mockReset();
    mockQueryRaw.mockResolvedValue([]);
    mockExamSubjectFindMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot view exam subjects", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "PARENT", schoolId: "s1" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns default subjects, filtering hidden ones", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockQueryRaw
      .mockResolvedValueOnce([]) // teacherSubjects
      .mockResolvedValueOnce([{ hiddenExamSubjects: ["MATHEMATICS"] }]); // getHiddenSubjects
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.subjects).not.toContain("MATHEMATICS");
    expect(json.subjects).toContain("SCIENCE");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamSubjectFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/exam-subjects", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamSubjectFindFirst.mockReset();
    mockExamSubjectCreate.mockReset();
    mockQueryRaw.mockReset();
    mockExecuteRaw.mockReset();
    mockExecuteRawUnsafe.mockReset();
    mockQueryRaw.mockResolvedValue([{ id: "settings1", hiddenExamSubjects: [] }]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ name: "Art" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that is neither school admin nor teacher", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await POST(makeRequest({ name: "Art" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 409 when the subject already exists and isn't hidden", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamSubjectFindFirst.mockResolvedValue({ id: "sub1" });
    const res = await POST(makeRequest({ name: "Art" }));
    expect(res.status).toBe(409);
  });

  it("creates a new subject", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamSubjectFindFirst.mockResolvedValue(null);
    mockExamSubjectCreate.mockResolvedValue({});
    const res = await POST(makeRequest({ name: "Art" }));
    expect(res.status).toBe(201);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamSubjectFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ name: "Art" }));
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/exam-subjects", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamSubjectFindFirst.mockReset();
    mockExamSubjectCreate.mockReset();
    mockExamSubjectUpdate.mockReset();
    mockQueryRaw.mockReset();
    mockExecuteRaw.mockReset();
    mockExecuteRawUnsafe.mockReset();
    mockQueryRaw.mockResolvedValue([{ id: "settings1", hiddenExamSubjects: [] }]);
  });

  it("returns 400 when from/to is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await PATCH(makeRequest({ from: "Art" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when the new name conflicts", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamSubjectFindFirst.mockResolvedValueOnce({ id: "existing" });
    const res = await PATCH(makeRequest({ from: "Art", to: "Craft" }));
    expect(res.status).toBe(409);
  });

  it("renames an existing subject", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamSubjectFindFirst
      .mockResolvedValueOnce(null) // conflict check
      .mockResolvedValueOnce({ id: "sub1" }); // find 'from' row
    mockExamSubjectUpdate.mockResolvedValue({});
    const res = await PATCH(makeRequest({ from: "Art", to: "Craft" }));
    expect(res.status).toBe(200);
    expect(mockExamSubjectUpdate).toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamSubjectFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH(makeRequest({ from: "Art", to: "Craft" }));
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/exam-subjects", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamSubjectDeleteMany.mockReset();
    mockQueryRaw.mockReset();
    mockExecuteRaw.mockReset();
    mockExecuteRawUnsafe.mockReset();
    mockQueryRaw.mockResolvedValue([{ id: "settings1", hiddenExamSubjects: [] }]);
  });

  it("returns 400 when name query param is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await DELETE(makeRequest(undefined));
    expect(res.status).toBe(400);
  });

  it("deletes the subject and hides it", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamSubjectDeleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(makeRequest(undefined, "?name=Art"));
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamSubjectDeleteMany.mockRejectedValue(new Error("DB exploded"));
    const res = await DELETE(makeRequest(undefined, "?name=Art"));
    expect(res.status).toBe(500);
  });
});
