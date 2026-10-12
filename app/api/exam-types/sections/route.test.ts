/**
 * @jest-environment node
 */
import { PUT } from "@/app/api/exam-types/sections/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockExamTypeFindFirst = jest.fn();
const mockExamTypeCreate = jest.fn();
const mockExamTypeFindUniqueOrThrow = jest.fn();
const mockTransaction = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    examType: {
      findFirst: (...args: unknown[]) => mockExamTypeFindFirst(...args),
      create: (...args: unknown[]) => mockExamTypeCreate(...args),
      findUniqueOrThrow: (...args: unknown[]) => mockExamTypeFindUniqueOrThrow(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/exam-types/sections", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

describe("PUT /api/exam-types/sections", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockExamTypeFindFirst.mockReset();
    mockExamTypeCreate.mockReset();
    mockExamTypeFindUniqueOrThrow.mockReset();
    mockTransaction.mockReset();
    mockTransaction.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that is neither school admin nor teacher", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await PUT(makeRequest({}));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await PUT(makeRequest({ sections: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when sections isn't an array", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await PUT(makeRequest({ name: "Midterm" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a section is missing a name", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await PUT(makeRequest({ name: "Midterm", sections: [{ maxMarks: 20 }] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a section has an invalid maxMarks", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await PUT(makeRequest({ name: "Midterm", sections: [{ name: "A", maxMarks: 0 }] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for duplicate section names", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await PUT(
      makeRequest({
        name: "Midterm",
        sections: [{ name: "A", maxMarks: 20 }, { name: "a", maxMarks: 10 }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("replaces sections for an existing exam type", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindFirst.mockResolvedValue({ id: "et1", maxMarks: null });
    mockExamTypeFindUniqueOrThrow.mockResolvedValue({
      id: "et1",
      name: "MIDTERM",
      maxMarks: 30,
      sections: [{ id: "sec1", name: "A", maxMarks: 30, order: 0 }],
    });
    const res = await PUT(
      makeRequest({ name: "Midterm", sections: [{ name: "A", maxMarks: 30 }] })
    );
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("creates the exam type when none exists yet", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindFirst.mockResolvedValue(null);
    mockExamTypeCreate.mockResolvedValue({ id: "et1", maxMarks: null });
    mockExamTypeFindUniqueOrThrow.mockResolvedValue({ id: "et1", name: "MIDTERM", maxMarks: null, sections: [] });
    const res = await PUT(makeRequest({ name: "Midterm", sections: [] }));
    expect(res.status).toBe(200);
    expect(mockExamTypeCreate).toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTypeFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(makeRequest({ name: "Midterm", sections: [] }));
    expect(res.status).toBe(500);
  });
});
