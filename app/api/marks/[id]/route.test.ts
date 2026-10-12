/**
 * @jest-environment node
 */
import { PUT, DELETE } from "@/app/api/marks/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockMarkFindUnique = jest.fn();
const mockMarkUpdate = jest.fn();
const mockMarkDelete = jest.fn();
const mockExamTypeFindFirst = jest.fn();
const mockAssertTeacherCanEnterMarks = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/teacher/teacherMarksScope", () => ({
  assertTeacherCanEnterMarks: (...args: unknown[]) => mockAssertTeacherCanEnterMarks(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    mark: {
      findUnique: (...args: unknown[]) => mockMarkFindUnique(...args),
      update: (...args: unknown[]) => mockMarkUpdate(...args),
      delete: (...args: unknown[]) => mockMarkDelete(...args),
    },
    examType: { findFirst: (...args: unknown[]) => mockExamTypeFindFirst(...args) },
  },
}));

function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/marks/m1", { method: "PUT", body: JSON.stringify(body) });
}
function makeDeleteRequest() {
  return new Request("http://localhost/api/marks/m1", { method: "DELETE" });
}
const params = Promise.resolve({ id: "m1" });

const existingMark = {
  id: "m1",
  teacherId: "t1",
  classId: "c1",
  subject: "Math",
  marks: 70,
  totalMarks: 100,
  examType: null,
  class: { schoolId: "s1" },
};

describe("PUT /api/marks/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockMarkFindUnique.mockReset();
    mockMarkUpdate.mockReset();
    mockExamTypeFindFirst.mockReset();
    mockAssertTeacherCanEnterMarks.mockReset();
    mockAssertTeacherCanEnterMarks.mockResolvedValue({ ok: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(makePutRequest({}), { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid components", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    const res = await PUT(makePutRequest({ components: "nope" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the mark doesn't exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockMarkFindUnique.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ marks: 80 }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when updating someone else's mark", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t2" } });
    mockMarkFindUnique.mockResolvedValue(existingMark);
    const res = await PUT(makePutRequest({ marks: 80 }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when the updated marks exceed totalMarks", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockMarkFindUnique.mockResolvedValue(existingMark);
    const res = await PUT(makePutRequest({ marks: 150, totalMarks: 100 }), { params });
    expect(res.status).toBe(400);
  });

  it("returns the scope error status when the teacher can't enter marks for the (new) subject", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockMarkFindUnique.mockResolvedValue(existingMark);
    mockAssertTeacherCanEnterMarks.mockResolvedValue({ ok: false, status: 403, message: "Not allowed" });
    const res = await PUT(makePutRequest({ subject: "Science" }), { params });
    expect(res.status).toBe(403);
  });

  it("updates the mark and recalculates grade", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockMarkFindUnique.mockResolvedValue(existingMark);
    mockMarkUpdate.mockResolvedValue({ id: "m1", marks: 95, grade: "A+" });
    const res = await PUT(makePutRequest({ marks: 95, totalMarks: 100 }), { params });
    expect(res.status).toBe(200);
    expect(mockMarkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ marks: 95, grade: "A+" }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockMarkFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(makePutRequest({ marks: 80 }), { params });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/marks/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockMarkFindUnique.mockReset();
    mockMarkDelete.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the mark doesn't exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockMarkFindUnique.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when deleting someone else's mark", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t2" } });
    mockMarkFindUnique.mockResolvedValue({ id: "m1", teacherId: "t1" });
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(403);
  });

  it("deletes the mark", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockMarkFindUnique.mockResolvedValue({ id: "m1", teacherId: "t1" });
    mockMarkDelete.mockResolvedValue({ id: "m1" });
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockMarkFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(500);
  });
});
