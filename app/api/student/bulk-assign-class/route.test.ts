/**
 * @jest-environment node
 */
import { PUT } from "@/app/api/student/bulk-assign-class/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockRequireSchoolId = jest.fn();
const mockClassFindFirst = jest.fn();
const mockStudentFindMany = jest.fn();
const mockStudentUpdateMany = jest.fn();
const mockStudentFeeUpsert = jest.fn();
const mockRunWithDeferredCacheInvalidation = jest.fn();
const mockBuildTuitionBulkCache = jest.fn();
const mockBuildStudentFeeRecalcPayload = jest.fn();
const mockInvalidateStudentListCaches = jest.fn();
const mockPurgeSchoolDashboardServerCacheMatching = jest.fn();
const mockInvalidateStudentFeeReadCaches = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/auth/tenant", () => ({
  requireSchoolId: (...args: unknown[]) => mockRequireSchoolId(...args),
}));

jest.mock("@/lib/students/invalidateStudentListCaches", () => ({
  invalidateStudentListCaches: (...args: unknown[]) => mockInvalidateStudentListCaches(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  purgeSchoolDashboardServerCacheMatching: (...args: unknown[]) =>
    mockPurgeSchoolDashboardServerCacheMatching(...args),
}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...args: unknown[]) => mockInvalidateStudentFeeReadCaches(...args),
}));

jest.mock("@/lib/fees/studentTuitionFromStructure", () => ({
  buildTuitionBulkCache: (...args: unknown[]) => mockBuildTuitionBulkCache(...args),
  buildStudentFeeRecalcPayload: (...args: unknown[]) => mockBuildStudentFeeRecalcPayload(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    student: {
      findMany: (...args: unknown[]) => mockStudentFindMany(...args),
      updateMany: (...args: unknown[]) => mockStudentUpdateMany(...args),
    },
    studentFee: { upsert: (...args: unknown[]) => mockStudentFeeUpsert(...args) },
  },
  runWithDeferredCacheInvalidation: (...args: unknown[]) => mockRunWithDeferredCacheInvalidation(...args),
}));

const request = (body: unknown) =>
  new Request("http://localhost/api/student/bulk-assign-class", {
    method: "PUT",
    body: JSON.stringify(body),
  });

const staffSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };
const classData = { id: "c1", name: "5", section: "A" };

describe("PUT /api/student/bulk-assign-class", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockRequireSchoolId.mockReset().mockResolvedValue({ ok: true, schoolId: "s1" });
    mockClassFindFirst.mockReset().mockResolvedValue(classData);
    mockStudentFindMany.mockReset();
    mockStudentUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    mockStudentFeeUpsert.mockReset().mockResolvedValue({});
    mockRunWithDeferredCacheInvalidation.mockReset().mockImplementation(async (fn: () => unknown) => fn());
    mockBuildTuitionBulkCache.mockReset().mockResolvedValue({});
    mockBuildStudentFeeRecalcPayload.mockReset().mockReturnValue({
      totalFee: 1000,
      discountPercent: 0,
      finalFee: 1000,
      amountPaid: 0,
      remainingFee: 1000,
    });
    mockInvalidateStudentListCaches.mockReset();
    mockPurgeSchoolDashboardServerCacheMatching.mockReset();
    mockInvalidateStudentFeeReadCaches.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(request({ studentIds: ["stu1"], classId: "c1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage students", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await PUT(request({ studentIds: ["stu1"], classId: "c1" }));
    expect(res.status).toBe(403);
  });

  it("returns the requireSchoolId error status/message when it fails", async () => {
    mockGetServerSession.mockResolvedValue(staffSession);
    mockRequireSchoolId.mockResolvedValue({ ok: false, status: 400, message: "School not found in session" });
    const res = await PUT(request({ studentIds: ["stu1"], classId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no studentIds are provided", async () => {
    mockGetServerSession.mockResolvedValue(staffSession);
    const res = await PUT(request({ studentIds: [], classId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when classId is missing", async () => {
    mockGetServerSession.mockResolvedValue(staffSession);
    const res = await PUT(request({ studentIds: ["stu1"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when more than 500 unique students are given", async () => {
    mockGetServerSession.mockResolvedValue(staffSession);
    const ids = Array.from({ length: 501 }, (_, i) => `stu${i}`);
    const res = await PUT(request({ studentIds: ids, classId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the target class is not in the school", async () => {
    mockGetServerSession.mockResolvedValue(staffSession);
    mockClassFindFirst.mockResolvedValue(null);
    const res = await PUT(request({ studentIds: ["stu1"], classId: "c1" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when one or more students are not found in the school", async () => {
    mockGetServerSession.mockResolvedValue(staffSession);
    mockStudentFindMany.mockResolvedValue([{ id: "stu1", classId: null, residencyType: "Day Scholar", fee: null }]);
    const res = await PUT(request({ studentIds: ["stu1", "stu2"], classId: "c1" }));
    expect(res.status).toBe(404);
  });

  it("returns a no-op success when all students are already in the target class", async () => {
    mockGetServerSession.mockResolvedValue(staffSession);
    mockStudentFindMany.mockResolvedValue([{ id: "stu1", classId: "c1", residencyType: "Day Scholar", fee: null }]);
    const res = await PUT(request({ studentIds: ["stu1"], classId: "c1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updatedCount).toBe(0);
    expect(mockStudentUpdateMany).not.toHaveBeenCalled();
  });

  it("assigns only the students not already in the class and recalculates their fees", async () => {
    mockGetServerSession.mockResolvedValue(staffSession);
    mockStudentFindMany.mockResolvedValue([
      { id: "stu1", classId: "c2", residencyType: "Day Scholar", fee: { discountPercent: 0, amountPaid: 100 } },
      { id: "stu2", classId: "c1", residencyType: "Day Scholar", fee: null },
    ]);

    const res = await PUT(request({ studentIds: ["stu1", "stu2"], classId: "c1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updatedCount).toBe(1);
    expect(json.message).toMatch(/Assigned 1 student to section successfully/);

    expect(mockStudentUpdateMany).toHaveBeenCalledWith({
      where: { schoolId: "s1", id: { in: ["stu1"] } },
      data: { classId: "c1" },
    });
    expect(mockStudentFeeUpsert).toHaveBeenCalledTimes(1);
    expect(mockInvalidateStudentFeeReadCaches).toHaveBeenCalledWith({ studentId: "stu1", schoolId: "s1" });
    expect(mockInvalidateStudentListCaches).toHaveBeenCalledWith("s1");
    expect(mockPurgeSchoolDashboardServerCacheMatching).toHaveBeenCalledWith("class:list:lite:s1");
    expect(mockPurgeSchoolDashboardServerCacheMatching).toHaveBeenCalledWith("students:list:s1");
  });

  it("deduplicates repeated studentIds before processing", async () => {
    mockGetServerSession.mockResolvedValue(staffSession);
    mockStudentFindMany.mockResolvedValue([{ id: "stu1", classId: "c2", residencyType: "Day Scholar", fee: null }]);

    await PUT(request({ studentIds: ["stu1", "stu1", " stu1 "], classId: "c1" }));
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["stu1"] } }) })
    );
  });

  it("uses plural wording when multiple students are assigned", async () => {
    mockGetServerSession.mockResolvedValue(staffSession);
    mockStudentFindMany.mockResolvedValue([
      { id: "stu1", classId: "c2", residencyType: "Day Scholar", fee: null },
      { id: "stu2", classId: "c2", residencyType: "Day Scholar", fee: null },
    ]);
    const res = await PUT(request({ studentIds: ["stu1", "stu2"], classId: "c1" }));
    const json = await res.json();
    expect(json.message).toMatch(/Assigned 2 students to section successfully/);
  });

  it("returns 500 when the database update throws", async () => {
    mockGetServerSession.mockResolvedValue(staffSession);
    mockStudentFindMany.mockResolvedValue([{ id: "stu1", classId: "c2", residencyType: "Day Scholar", fee: null }]);
    mockStudentUpdateMany.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(request({ studentIds: ["stu1"], classId: "c1" }));
    expect(res.status).toBe(500);
  });
});
