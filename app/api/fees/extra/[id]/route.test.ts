/**
 * @jest-environment node
 */
import { PATCH, DELETE } from "@/app/api/fees/extra/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockExtraFeeFindFirst = jest.fn();
const mockExtraFeeDelete = jest.fn();
const mockStudentFindMany = jest.fn();
const mockExecuteRaw = jest.fn();
const mockPatchExtraFeeWithInstallmentSupport = jest.fn();
const mockSnapshotExtraFeeNameOnAllocations = jest.fn();
const mockInvalidateSchoolFeeReadCaches = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/fees/extraFeeInstallmentDb", () => ({
  patchExtraFeeWithInstallmentSupport: (...args: unknown[]) =>
    mockPatchExtraFeeWithInstallmentSupport(...args),
}));

jest.mock("@/lib/fees/backfillPaymentAllocationComponentNames", () => ({
  snapshotExtraFeeNameOnAllocations: (...args: unknown[]) =>
    mockSnapshotExtraFeeNameOnAllocations(...args),
}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateSchoolFeeReadCaches: (...args: unknown[]) => mockInvalidateSchoolFeeReadCaches(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    extraFee: {
      findFirst: (...args: unknown[]) => mockExtraFeeFindFirst(...args),
      delete: (...args: unknown[]) => mockExtraFeeDelete(...args),
    },
    student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
  },
}));

const ctx = { params: Promise.resolve({ id: "ef1" }) };

const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/fees/extra/ef1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
const deleteRequest = () => new Request("http://localhost/api/fees/extra/ef1", { method: "DELETE" });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const existingExtraFee = {
  id: "ef1",
  schoolId: "s1",
  name: "Sports Fee",
  amount: 500,
  targetType: "SCHOOL",
  targetClassId: null,
  targetSection: null,
  targetStudentId: null,
  residencyScope: "ALL",
  splitIntoTwoInstallments: false,
};

describe("PATCH /api/fees/extra/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockExtraFeeFindFirst.mockReset();
    mockStudentFindMany.mockReset().mockResolvedValue([]);
    mockExecuteRaw.mockReset().mockResolvedValue(1);
    mockPatchExtraFeeWithInstallmentSupport.mockReset();
    mockInvalidateSchoolFeeReadCaches.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ amount: 600 }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await PATCH(patchRequest({ amount: 600 }), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ amount: 600 }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the extra fee is not found in the school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockExtraFeeFindFirst.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ amount: 600 }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns the unchanged extra fee when the helper reports no changes", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockExtraFeeFindFirst.mockResolvedValue(existingExtraFee);
    mockPatchExtraFeeWithInstallmentSupport.mockResolvedValue("no_changes");

    const res = await PATCH(patchRequest({ amount: 500 }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.extraFee.id).toBe("ef1");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockInvalidateSchoolFeeReadCaches).not.toHaveBeenCalled();
  });

  it("applies the student fee delta to eligible students and invalidates fee-read caches", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockExtraFeeFindFirst.mockResolvedValue(existingExtraFee);
    mockStudentFindMany.mockResolvedValue([
      { id: "stu1", residencyType: "Day Scholar" },
      { id: "stu2", residencyType: "Hosteller" },
    ]);
    mockPatchExtraFeeWithInstallmentSupport.mockResolvedValue({
      extraFee: { id: "ef1", amount: 700 },
      extraFeeIds: ["ef1"],
      splitApplied: false,
      migrated: false,
      studentFeeDelta: 200,
    });

    const res = await PATCH(patchRequest({ amount: 700 }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.extraFee.amount).toBe(700);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockInvalidateSchoolFeeReadCaches).toHaveBeenCalledWith("s1");
  });

  it("skips the student fee delta update when the delta is zero", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockExtraFeeFindFirst.mockResolvedValue(existingExtraFee);
    mockPatchExtraFeeWithInstallmentSupport.mockResolvedValue({
      extraFee: { id: "ef1", name: "Renamed" },
      extraFeeIds: ["ef1"],
      splitApplied: false,
      migrated: false,
      studentFeeDelta: 0,
    });

    const res = await PATCH(patchRequest({ name: "Renamed" }), ctx);
    expect(res.status).toBe(200);
    expect(mockStudentFindMany).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockInvalidateSchoolFeeReadCaches).toHaveBeenCalledWith("s1");
  });
});

describe("DELETE /api/fees/extra/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockExtraFeeFindFirst.mockReset();
    mockExtraFeeDelete.mockReset();
    mockStudentFindMany.mockReset().mockResolvedValue([]);
    mockExecuteRaw.mockReset().mockResolvedValue(1);
    mockSnapshotExtraFeeNameOnAllocations.mockReset().mockResolvedValue(undefined);
    mockInvalidateSchoolFeeReadCaches.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the extra fee is not found in the school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockExtraFeeFindFirst.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("reverses the fee for eligible students, snapshots allocation names, deletes the row, and invalidates caches", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockExtraFeeFindFirst.mockResolvedValue(existingExtraFee);
    mockStudentFindMany.mockResolvedValue([{ id: "stu1", residencyType: "Day Scholar" }]);

    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockSnapshotExtraFeeNameOnAllocations).toHaveBeenCalledWith(
      expect.anything(),
      "ef1",
      "Sports Fee"
    );
    expect(mockExtraFeeDelete).toHaveBeenCalledWith({ where: { id: "ef1" } });
    expect(mockInvalidateSchoolFeeReadCaches).toHaveBeenCalledWith("s1");
  });
});
