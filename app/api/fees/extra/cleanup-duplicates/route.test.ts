/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/fees/extra/cleanup-duplicates/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockClassFindMany = jest.fn();
const mockStudentFindMany = jest.fn();
const mockRunWithDeferredCacheInvalidation = jest.fn();
const mockFindMessFeeDuplicateIssues = jest.fn();
const mockCountMessDuplicateExtraFeeIds = jest.fn();
const mockCleanupDuplicateHostelMessExtraFees = jest.fn();
const mockRepairIncompleteHostelMessInstallmentPairs = jest.fn();
const mockBuildTuitionBulkCache = jest.fn();
const mockUpsertStudentFeeFromStructure = jest.fn();
const mockBackfillPaymentAllocationComponentNames = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/fees/findMessFeeDuplicateIssues", () => ({
  findMessFeeDuplicateIssues: (...args: unknown[]) => mockFindMessFeeDuplicateIssues(...args),
  countMessDuplicateExtraFeeIds: (...args: unknown[]) => mockCountMessDuplicateExtraFeeIds(...args),
}));

jest.mock("@/lib/fees/cleanupDuplicateHostelMessExtraFees", () => ({
  cleanupDuplicateHostelMessExtraFees: (...args: unknown[]) =>
    mockCleanupDuplicateHostelMessExtraFees(...args),
  repairIncompleteHostelMessInstallmentPairs: (...args: unknown[]) =>
    mockRepairIncompleteHostelMessInstallmentPairs(...args),
}));

jest.mock("@/lib/fees/studentTuitionFromStructure", () => ({
  buildTuitionBulkCache: (...args: unknown[]) => mockBuildTuitionBulkCache(...args),
  upsertStudentFeeFromStructure: (...args: unknown[]) => mockUpsertStudentFeeFromStructure(...args),
}));

jest.mock("@/lib/fees/backfillPaymentAllocationComponentNames", () => ({
  backfillPaymentAllocationComponentNames: (...args: unknown[]) =>
    mockBackfillPaymentAllocationComponentNames(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    extraFee: { findMany: (...args: unknown[]) => mockExtraFeeFindMany(...args) },
    class: { findMany: (...args: unknown[]) => mockClassFindMany(...args) },
    student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
  },
  runWithDeferredCacheInvalidation: (...args: unknown[]) => mockRunWithDeferredCacheInvalidation(...args),
}));

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("GET /api/fees/extra/cleanup-duplicates", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockExtraFeeFindMany.mockReset().mockResolvedValue([]);
    mockClassFindMany.mockReset().mockResolvedValue([]);
    mockFindMessFeeDuplicateIssues.mockReset().mockReturnValue([]);
    mockCountMessDuplicateExtraFeeIds.mockReset().mockReturnValue(0);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("reports duplicate issues and mess-fee counts by target type", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockExtraFeeFindMany.mockResolvedValue([
      { id: "ef1", name: "Mess Fee", targetType: "STUDENT" },
      { id: "ef2", name: "Hostel Mess", targetType: "CLASS" },
      { id: "ef3", name: "Sports", targetType: "SCHOOL" },
    ]);
    mockFindMessFeeDuplicateIssues.mockReturnValue([{ issue: "dup" }]);
    mockCountMessDuplicateExtraFeeIds.mockReturnValue(2);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.issues).toEqual([{ issue: "dup" }]);
    expect(json.duplicateRowCount).toBe(2);
    expect(json.studentMessCount).toBe(1);
    expect(json.classMessCount).toBe(1);
  });
});

describe("POST /api/fees/extra/cleanup-duplicates", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockExtraFeeFindMany.mockReset().mockResolvedValue([]);
    mockClassFindMany.mockReset().mockResolvedValue([]);
    mockStudentFindMany.mockReset().mockResolvedValue([]);
    mockFindMessFeeDuplicateIssues.mockReset().mockReturnValue([]);
    mockCountMessDuplicateExtraFeeIds.mockReset().mockReturnValue(0);
    mockCleanupDuplicateHostelMessExtraFees.mockReset().mockResolvedValue(false);
    mockRepairIncompleteHostelMessInstallmentPairs.mockReset().mockResolvedValue(0);
    mockBuildTuitionBulkCache.mockReset().mockResolvedValue({});
    mockUpsertStudentFeeFromStructure.mockReset().mockResolvedValue(undefined);
    mockBackfillPaymentAllocationComponentNames.mockReset().mockResolvedValue({
      fromExtraFee: 0,
      inferredHostelMess: 0,
      reassigned: 0,
      lastYearSplit: 0,
    });
    mockRunWithDeferredCacheInvalidation.mockReset().mockImplementation(async (fn: () => unknown) => fn());
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(400);
  });

  it("reports 'no duplicates found' and skips recalculating students without a fee record", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFindMany.mockResolvedValue([{ id: "stu1", classId: "c1", residencyType: "Day Scholar", class: { section: "A" }, fee: null }]);

    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/no duplicate mess fees found/i);
    expect(json.studentsRecalculated).toBe(0);
    expect(mockUpsertStudentFeeFromStructure).not.toHaveBeenCalled();
  });

  it("cleans up duplicates, repairs installment pairs, and recalculates every student with a fee record", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockCountMessDuplicateExtraFeeIds.mockReturnValueOnce(3).mockReturnValueOnce(0);
    mockCleanupDuplicateHostelMessExtraFees.mockResolvedValue(true);
    mockRepairIncompleteHostelMessInstallmentPairs.mockResolvedValue(2);
    mockStudentFindMany.mockResolvedValue([
      { id: "stu1", classId: "c1", residencyType: "Day Scholar", class: { section: "A" }, fee: { discountPercent: 0, amountPaid: 100 } },
      { id: "stu2", classId: "c2", residencyType: "Hosteller", class: { section: "B" }, fee: { discountPercent: 10, amountPaid: 200 } },
    ]);

    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/repaired or duplicates removed/i);
    expect(json.removedDuplicateRows).toBe(3);
    expect(json.installmentPairsRepaired).toBe(2);
    expect(json.hostelMessCleaned).toBe(true);
    expect(json.studentsRecalculated).toBe(2);
    expect(mockUpsertStudentFeeFromStructure).toHaveBeenCalledTimes(2);
    expect(mockBackfillPaymentAllocationComponentNames).toHaveBeenCalledWith(expect.anything(), "s1");
    expect(mockRunWithDeferredCacheInvalidation).toHaveBeenCalledTimes(1);
  });
});
