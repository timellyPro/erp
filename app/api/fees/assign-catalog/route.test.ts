/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/assign-catalog/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolIdForSession = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockTemplateFindMany = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockClassFindMany = jest.fn();
const mockStructureFindUnique = jest.fn();
const mockGetAssignCatalogMemCached = jest.fn();
const mockSetAssignCatalogMemCached = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/app/api/fees/extra-head-templates/resolveSchoolId", () => ({
  resolveFeesSchoolIdForSession: (...args: unknown[]) => mockResolveFeesSchoolIdForSession(...args),
}));

jest.mock("@/lib/fees/assignCatalogServerCache", () => ({
  getAssignCatalogMemCached: (...args: unknown[]) => mockGetAssignCatalogMemCached(...args),
  setAssignCatalogMemCached: (...args: unknown[]) => mockSetAssignCatalogMemCached(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
    extraFeeHeadTemplate: { findMany: (...args: unknown[]) => mockTemplateFindMany(...args) },
    extraFee: { findMany: (...args: unknown[]) => mockExtraFeeFindMany(...args) },
    class: { findMany: (...args: unknown[]) => mockClassFindMany(...args) },
    classFeeStructure: { findUnique: (...args: unknown[]) => mockStructureFindUnique(...args) },
  },
}));

const request = (query = "") => new Request(`http://localhost/api/fees/assign-catalog${query}`);

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("GET /api/fees/assign-catalog", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolIdForSession.mockReset();
    mockStudentFindFirst.mockReset();
    mockTemplateFindMany.mockReset().mockResolvedValue([]);
    mockExtraFeeFindMany.mockReset().mockResolvedValue([]);
    mockClassFindMany.mockReset().mockResolvedValue([]);
    mockStructureFindUnique.mockReset().mockResolvedValue(null);
    mockGetAssignCatalogMemCached.mockReset().mockReturnValue(null);
    mockSetAssignCatalogMemCached.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns a cached payload without querying the database", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockGetAssignCatalogMemCached.mockReturnValue({ templates: [{ id: "cached" }] });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.templates).toEqual([{ id: "cached" }]);
    expect(mockTemplateFindMany).not.toHaveBeenCalled();
  });

  it("bypasses the cache when refresh=1 is set", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockGetAssignCatalogMemCached.mockReturnValue({ templates: [{ id: "cached" }] });
    const res = await GET(request("?refresh=1"));
    expect(res.status).toBe(200);
    expect(mockTemplateFindMany).toHaveBeenCalled();
  });

  it("resolves classId/section from the student when only studentId is given", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockStudentFindFirst.mockResolvedValue({ classId: "c1", class: { id: "c1", section: "A" } });

    const res = await GET(request("?studentId=stu1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.resolvedClassId).toBe("c1");
    expect(json.resolvedSection).toBe("A");
  });

  it("skips the class list query when skipClasses=1 is set", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    const res = await GET(request("?skipClasses=1"));
    expect(res.status).toBe(200);
    expect(mockClassFindMany).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.classes).toEqual([]);
  });

  it("separates catalog extras (SCHOOL/CLASS/SECTION) from existing student-specific extras", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockExtraFeeFindMany.mockResolvedValue([
      { id: "ef1", name: "Sports", amount: 500, targetType: "SCHOOL", splitIntoTwoInstallments: false },
      { id: "ef2", name: "Uniform", amount: 300, targetType: "STUDENT", targetStudentId: "stu1", splitIntoTwoInstallments: false },
    ]);

    const res = await GET(request("?studentId=stu1&classId=c1&section=A"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.catalogExtras).toHaveLength(1);
    expect(json.catalogExtras[0].id).toBe("ef1");
    expect(json.existingStudentExtras).toEqual([
      { id: "ef2", name: "Uniform", amount: 300, splitIntoTwoInstallments: false },
    ]);
  });

  it("computes classBaseFeeTotal from the class structure's components", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockStructureFindUnique.mockResolvedValue({
      schoolId: "s1",
      components: [{ name: "Tuition", amount: 800 }, { name: "Lab", amount: 200 }],
    });

    const res = await GET(request("?classId=c1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.classBaseFeeTotal).toBe(1000);
    expect(mockSetAssignCatalogMemCached).toHaveBeenCalled();
  });

  it("ignores a structure row that belongs to a different school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockStructureFindUnique.mockResolvedValue({
      schoolId: "other-school",
      components: [{ name: "Tuition", amount: 800 }],
    });

    const res = await GET(request("?classId=c1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.classBaseFeeTotal).toBeNull();
  });
});
