/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/fees/extra/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockClassFindFirst = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockExtraFeeFindFirst = jest.fn();
const mockStudentFindMany = jest.fn();
const mockStudentFeeUpdateMany = jest.fn();
const mockCreateExtraFeeRows = jest.fn();
const mockMigrateUnsplitLumpExtraFees = jest.fn();
const mockInvalidateAssignCatalogServerCache = jest.fn();
const mockInvalidateStudentFeeReadCaches = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/extraFeeInstallmentDb", () => ({
  createExtraFeeRows: (...args: unknown[]) => mockCreateExtraFeeRows(...args),
  migrateUnsplitLumpExtraFees: (...args: unknown[]) => mockMigrateUnsplitLumpExtraFees(...args),
}));

jest.mock("@/lib/fees/assignCatalogServerCache", () => ({
  invalidateAssignCatalogServerCache: (...args: unknown[]) => mockInvalidateAssignCatalogServerCache(...args),
}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...args: unknown[]) => mockInvalidateStudentFeeReadCaches(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    extraFee: {
      findMany: (...args: unknown[]) => mockExtraFeeFindMany(...args),
      findFirst: (...args: unknown[]) => mockExtraFeeFindFirst(...args),
    },
    student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
    studentFee: { updateMany: (...args: unknown[]) => mockStudentFeeUpdateMany(...args) },
  },
}));

const getRequest = (query = "") => new Request(`http://localhost/api/fees/extra${query}`);
const postRequest = (body: unknown) =>
  new Request("http://localhost/api/fees/extra", {
    method: "POST",
    body: JSON.stringify(body),
  });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const validBody = {
  name: "Sports Fee",
  amount: 500,
  targetType: "SCHOOL",
};

describe("GET /api/fees/extra", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockClassFindFirst.mockReset();
    mockExtraFeeFindMany.mockReset();
    mockMigrateUnsplitLumpExtraFees.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    mockClassFindFirst.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(400);
  });

  it("returns the school's extra fees", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockExtraFeeFindMany.mockResolvedValue([
      { id: "ef1", name: "Sports Fee", amount: 500, splitIntoTwoInstallments: false },
    ]);
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.extraFees).toHaveLength(1);
    expect(mockMigrateUnsplitLumpExtraFees).not.toHaveBeenCalled();
  });

  it("migrates unsplit lump fees when maintenance=1 is requested", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockExtraFeeFindMany
      .mockResolvedValueOnce([
        {
          id: "ef1",
          schoolId: "s1",
          name: "Hostel Fee",
          amount: 10000,
          targetType: "SCHOOL",
          targetClassId: null,
          targetSection: null,
          targetStudentId: null,
          residencyScope: "HOSTELLER",
          splitIntoTwoInstallments: false,
        },
      ])
      .mockResolvedValueOnce([{ id: "ef1a" }, { id: "ef1b" }]);
    mockMigrateUnsplitLumpExtraFees.mockResolvedValue(undefined);

    const res = await GET(getRequest("?maintenance=1"));
    expect(res.status).toBe(200);
    expect(mockMigrateUnsplitLumpExtraFees).toHaveBeenCalledTimes(1);
    const json = await res.json();
    expect(json.extraFees).toHaveLength(2);
  });
});

describe("POST /api/fees/extra", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockClassFindFirst.mockReset();
    mockExtraFeeFindFirst.mockReset();
    mockStudentFindMany.mockReset().mockResolvedValue([]);
    mockStudentFeeUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    mockCreateExtraFeeRows.mockReset().mockResolvedValue({ ids: ["ef1"], totalAmount: 500 });
    mockExtraFeeFindFirst.mockResolvedValue({ id: "ef1", name: "Sports Fee", amount: 500 });
    mockInvalidateAssignCatalogServerCache.mockReset();
    mockInvalidateStudentFeeReadCaches.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid residencyScope", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(postRequest({ ...validBody, residencyScope: "BOTH" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(postRequest({ amount: 500, targetType: "SCHOOL" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid targetType", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(postRequest({ ...validBody, targetType: "TEACHER" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetClassId is missing for a CLASS target", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(postRequest({ ...validBody, targetType: "CLASS" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetSection is missing for a SECTION target", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(
      postRequest({ ...validBody, targetType: "SECTION", targetClassId: "c1" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetStudentId is missing for a STUDENT target", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(postRequest({ ...validBody, targetType: "STUDENT" }));
    expect(res.status).toBe(400);
  });

  it("creates a school-wide extra fee and increments fees for every student in the school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFindMany.mockResolvedValue([
      { id: "stu1", residencyType: "Day Scholar" },
      { id: "stu2", residencyType: "Hosteller" },
    ]);

    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.extraFeeIds).toEqual(["ef1"]);

    expect(mockCreateExtraFeeRows).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        schoolId: "s1",
        name: "Sports Fee",
        amount: 500,
        targetType: "SCHOOL",
      })
    );
    expect(mockStudentFindMany).toHaveBeenCalledWith({
      where: { schoolId: "s1" },
      select: { id: true, residencyType: true },
    });
    expect(mockStudentFeeUpdateMany).toHaveBeenCalledWith({
      where: { studentId: { in: ["stu1", "stu2"] } },
      data: {
        totalFee: { increment: 500 },
        finalFee: { increment: 500 },
        remainingFee: { increment: 500 },
      },
    });
    expect(mockInvalidateAssignCatalogServerCache).toHaveBeenCalledWith("s1");
    expect(mockInvalidateStudentFeeReadCaches).not.toHaveBeenCalled();
  });

  it("skips studentFee updates when no students are eligible under the residency scope", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFindMany.mockResolvedValue([{ id: "stu1", residencyType: "Day Scholar" }]);

    const res = await POST(
      postRequest({ ...validBody, name: "Hostel Fee", residencyScope: "HOSTELLER" })
    );
    expect(res.status).toBe(201);
    expect(mockStudentFeeUpdateMany).not.toHaveBeenCalled();
  });

  it("targets a single student and invalidates that student's fee-read caches", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFindMany.mockResolvedValue([{ id: "stu1", residencyType: "Day Scholar" }]);

    const res = await POST(
      postRequest({ ...validBody, targetType: "STUDENT", targetStudentId: "stu1" })
    );
    expect(res.status).toBe(201);
    expect(mockStudentFindMany).toHaveBeenCalledWith({
      where: { schoolId: "s1", id: "stu1" },
      select: { id: true, residencyType: true },
    });
    expect(mockInvalidateStudentFeeReadCaches).toHaveBeenCalledWith({
      studentId: "stu1",
      schoolId: "s1",
    });
  });
});
