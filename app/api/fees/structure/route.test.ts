/**
 * @jest-environment node
 */
import { GET, PUT, DELETE } from "@/app/api/fees/structure/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockStructureFindMany = jest.fn();
const mockStructureDeleteMany = jest.fn();
const mockClassFindFirst = jest.fn();
const mockStudentFindMany = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockStudentFeeUpdate = jest.fn();
const mockSaveClassFeeStructureAndSyncStudents = jest.fn();
const mockInvalidateSchoolFeeReadCaches = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/fees/classFeeStructureApply", () => ({
  saveClassFeeStructureAndSyncStudents: (...args: unknown[]) =>
    mockSaveClassFeeStructureAndSyncStudents(...args),
}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateSchoolFeeReadCaches: (...args: unknown[]) => mockInvalidateSchoolFeeReadCaches(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    classFeeStructure: {
      findMany: (...args: unknown[]) => mockStructureFindMany(...args),
      deleteMany: (...args: unknown[]) => mockStructureDeleteMany(...args),
    },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
    extraFee: { findMany: (...args: unknown[]) => mockExtraFeeFindMany(...args) },
    studentFee: { update: (...args: unknown[]) => mockStudentFeeUpdate(...args) },
  },
}));

const getRequest = (query = "") => new Request(`http://localhost/api/fees/structure${query}`);
const putRequest = (body: unknown) =>
  new Request("http://localhost/api/fees/structure", {
    method: "PUT",
    body: JSON.stringify(body),
  });
const deleteRequest = (query = "") =>
  new Request(`http://localhost/api/fees/structure${query}`, { method: "DELETE" });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("GET /api/fees/structure", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockStructureFindMany.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot view fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(400);
  });

  it("returns structures filtered by classId when provided", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStructureFindMany.mockResolvedValue([{ id: "cfs1", classId: "c1" }]);
    const res = await GET(getRequest("?classId=c1"));
    expect(res.status).toBe(200);
    expect(mockStructureFindMany).toHaveBeenCalledWith({
      where: { schoolId: "s1", classId: "c1" },
      include: { class: { select: { id: true, name: true, section: true } } },
    });
  });
});

describe("PUT /api/fees/structure", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockClassFindFirst.mockReset();
    mockSaveClassFeeStructureAndSyncStudents.mockReset();
    mockInvalidateSchoolFeeReadCaches.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(putRequest({ classId: "c1", components: [] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await PUT(putRequest({ classId: "c1", components: [] }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when classId or components are missing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await PUT(putRequest({ classId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the class does not belong to the school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockClassFindFirst.mockResolvedValue(null);
    const res = await PUT(putRequest({ classId: "c1", components: [] }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when a component is invalid", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockSaveClassFeeStructureAndSyncStudents.mockRejectedValue(
      new Error("Each component must have name and amount")
    );
    const res = await PUT(putRequest({ classId: "c1", components: [{}] }));
    expect(res.status).toBe(400);
  });

  it("saves the structure, syncs students, and invalidates fee caches", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockSaveClassFeeStructureAndSyncStudents.mockResolvedValue({
      structure: { id: "cfs1", classId: "c1", components: [{ name: "Tuition", amount: 1000 }] },
    });

    const res = await PUT(
      putRequest({ classId: "c1", components: [{ name: "Tuition", amount: 1000 }] })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.structure.id).toBe("cfs1");
    expect(mockSaveClassFeeStructureAndSyncStudents).toHaveBeenCalledWith({
      schoolId: "s1",
      classId: "c1",
      components: [{ name: "Tuition", amount: 1000 }],
    });
    expect(mockInvalidateSchoolFeeReadCaches).toHaveBeenCalledWith("s1");
  });

  it("returns 500 for an unrelated failure from the sync helper", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockSaveClassFeeStructureAndSyncStudents.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(putRequest({ classId: "c1", components: [] }));
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/fees/structure", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockStructureDeleteMany.mockReset();
    mockStudentFindMany.mockReset().mockResolvedValue([]);
    mockExtraFeeFindMany.mockReset().mockResolvedValue([]);
    mockStudentFeeUpdate.mockReset();
    mockInvalidateSchoolFeeReadCaches.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(deleteRequest("?classId=c1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await DELETE(deleteRequest("?classId=c1"));
    expect(res.status).toBe(403);
  });

  it("returns 400 when classId is missing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(400);
  });

  it("removes the structure and recomputes fee totals from extras only, for each student in the class", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFindMany.mockResolvedValue([
      {
        id: "stu1",
        residencyType: "Day Scholar",
        class: { section: "A" },
        fee: { discountPercent: 0, amountPaid: 200 },
      },
    ]);
    mockExtraFeeFindMany.mockResolvedValue([
      { name: "Sports", amount: 300, targetType: "SCHOOL", targetClassId: null, targetSection: null, targetStudentId: null, residencyScope: "ALL" },
    ]);

    const res = await DELETE(deleteRequest("?classId=c1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(mockStructureDeleteMany).toHaveBeenCalledWith({ where: { classId: "c1", schoolId: "s1" } });
    expect(mockStudentFeeUpdate).toHaveBeenCalledWith({
      where: { studentId: "stu1" },
      data: { totalFee: 300, finalFee: 300, remainingFee: 100 },
    });
    expect(mockInvalidateSchoolFeeReadCaches).toHaveBeenCalledWith("s1");
  });

  it("skips students who have no fee record", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFindMany.mockResolvedValue([
      { id: "stu1", residencyType: "Day Scholar", class: { section: "A" }, fee: null },
    ]);

    const res = await DELETE(deleteRequest("?classId=c1"));
    expect(res.status).toBe(200);
    expect(mockStudentFeeUpdate).not.toHaveBeenCalled();
  });
});
