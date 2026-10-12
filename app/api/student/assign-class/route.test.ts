/**
 * @jest-environment node
 */
import { PUT } from "@/app/api/student/assign-class/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockClassFindFirst = jest.fn();
const mockStudentUpdate = jest.fn();
const mockStudentFeeFindUnique = jest.fn();
const mockUpsertStudentFeeFromStructure = jest.fn();
const mockInvalidateStudentFeeReadCaches = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/studentTuitionFromStructure", () => ({
  upsertStudentFeeFromStructure: (...args: unknown[]) => mockUpsertStudentFeeFromStructure(...args),
}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...args: unknown[]) => mockInvalidateStudentFeeReadCaches(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    student: {
      findFirst: (...args: unknown[]) => mockStudentFindFirst(...args),
      update: (...args: unknown[]) => mockStudentUpdate(...args),
    },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    studentFee: { findUnique: (...args: unknown[]) => mockStudentFeeFindUnique(...args) },
  },
}));

const request = (body: unknown) =>
  new Request("http://localhost/api/student/assign-class", { method: "PUT", body: JSON.stringify(body) });

const session = { user: { id: "u1", schoolId: "s1" } };

describe("PUT /api/student/assign-class", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockStudentFindFirst.mockReset();
    mockClassFindFirst.mockReset();
    mockStudentUpdate.mockReset();
    mockStudentFeeFindUnique.mockReset().mockResolvedValue(null);
    mockUpsertStudentFeeFromStructure.mockReset().mockResolvedValue(undefined);
    mockInvalidateStudentFeeReadCaches.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(request({ studentId: "stu1", classId: "c1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await PUT(request({ studentId: "stu1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when studentId is missing", async () => {
    mockGetServerSession.mockResolvedValue(session);
    const res = await PUT(request({ classId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the student is not in the school", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await PUT(request({ studentId: "stu1", classId: "c1" }));
    expect(res.status).toBe(404);
  });

  it("cross-tenant: a School-A admin cannot move a School-B student into a School-A class", async () => {
    // Session belongs to school "s1". The student lookup is scoped to the
    // session's own schoolId (never an attacker-supplied one), so a student
    // that actually belongs to school "s2" is invisible to this query and
    // Prisma (correctly mocked here to reflect real `where` scoping) returns
    // null rather than the mutation silently reassigning another tenant's data.
    mockGetServerSession.mockResolvedValue(session); // schoolId: "s1"
    mockStudentFindFirst.mockResolvedValue(null); // stu-from-s2 not found under schoolId: "s1"

    const res = await PUT(request({ studentId: "stu-from-s2", classId: "c1" }));

    expect(res.status).toBe(404);
    expect(mockStudentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "stu-from-s2", schoolId: "s1" } })
    );
    expect(mockStudentUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when the given classId is not in the school", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockResolvedValue({ id: "stu1", user: { id: "u2" } });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await PUT(request({ studentId: "stu1", classId: "c1" }));
    expect(res.status).toBe(404);
  });

  it("assigns the student to the class, recomputes fees, and invalidates caches", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockResolvedValue({ id: "stu1", user: { id: "u2" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentUpdate.mockResolvedValue({
      id: "stu1",
      classId: "c1",
      class: { id: "c1", name: "5", section: "A" },
    });
    mockStudentFeeFindUnique.mockResolvedValue({ discountPercent: 10, amountPaid: 500 });

    const res = await PUT(request({ studentId: "stu1", classId: "c1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/assigned to class successfully/i);

    expect(mockStudentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "stu1" }, data: { classId: "c1" } })
    );
    expect(mockUpsertStudentFeeFromStructure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        schoolId: "s1",
        studentId: "stu1",
        classId: "c1",
        section: "A",
        discountPercent: 10,
        amountPaid: 500,
      })
    );
    expect(mockInvalidateStudentFeeReadCaches).toHaveBeenCalledWith({ studentId: "stu1", schoolId: "s1" });
  });

  it("removes the student from their class when classId is omitted", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockResolvedValue({ id: "stu1", user: { id: "u2" } });
    mockStudentUpdate.mockResolvedValue({ id: "stu1", classId: null, class: null });

    const res = await PUT(request({ studentId: "stu1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/removed from class successfully/i);
    expect(mockStudentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { classId: null } })
    );
  });

  it("returns 500 when the update throws", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockResolvedValue({ id: "stu1", user: { id: "u2" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentUpdate.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(request({ studentId: "stu1", classId: "c1" }));
    expect(res.status).toBe(500);
  });
});
