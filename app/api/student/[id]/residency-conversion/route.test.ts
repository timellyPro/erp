/**
 * @jest-environment node
 */
import { POST } from "@/app/api/student/[id]/residency-conversion/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockApply = jest.fn();
const mockUpsertFee = jest.fn();
const mockComputeBreakdown = jest.fn();
const mockInvalidateFeeCaches = jest.fn();
const mockInvalidateListCaches = jest.fn();

jest.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock("@/lib/auth/authOptions", () => ({}));
jest.mock("@/lib/auth/tenant", () => ({ schoolIdViaAdminRelation: jest.fn().mockResolvedValue("s1") }));
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { student: { findFirst: (...a: unknown[]) => mockStudentFindFirst(...a) } },
}));
jest.mock("@/lib/students/applyStudentResidencyConversion", () => ({
  applyStudentResidencyConversion: (...a: unknown[]) => mockApply(...a),
  previewStudentResidencyConversion: jest.fn(),
}));
jest.mock("@/lib/fees/studentTuitionFromStructure", () => ({
  upsertStudentFeeFromStructure: (...a: unknown[]) => mockUpsertFee(...a),
}));
jest.mock("@/lib/fees/computeAdminStudentFeeBreakdown", () => ({
  computeAdminStudentFeeBreakdown: (...a: unknown[]) => mockComputeBreakdown(...a),
}));
jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...a: unknown[]) => mockInvalidateFeeCaches(...a),
}));
jest.mock("@/lib/students/invalidateStudentListCaches", () => ({
  invalidateStudentListCaches: (...a: unknown[]) => mockInvalidateListCaches(...a),
}));

const ctx = { params: Promise.resolve({ id: "stu1" }) };
const admin = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/student/stu1/residency-conversion", { method: "POST", body: JSON.stringify(body) }), ctx);

const preview = { academicYearLabel: "2026-2027", periods: [], charges: [] };

describe("POST /api/student/[id]/residency-conversion", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset().mockResolvedValue(admin);
    mockStudentFindFirst.mockReset().mockResolvedValue({
      id: "stu1",
      residencyType: "Day Scholar",
      classId: "c1",
      class: { section: "A" },
    });
    mockApply.mockReset().mockResolvedValue(preview);
    mockUpsertFee.mockReset().mockResolvedValue(undefined);
    mockComputeBreakdown.mockReset().mockResolvedValue({});
    mockInvalidateFeeCaches.mockReset();
    mockInvalidateListCaches.mockReset();
  });

  it("rejects a conversion to the type the student already has", async () => {
    const res = await post({ toResidency: "Day Scholar" });
    expect(res.status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("recalculates the stored fee INSIDE the conversion transaction, not after it", async () => {
    // apply() invokes the hook with the transaction client, as the real one does before it commits
    const tx = { studentFee: { findUnique: jest.fn().mockResolvedValue({ discountPercent: 12.5, amountPaid: 4000 }) } };
    mockApply.mockImplementation(async (_db: unknown, _input: unknown, hooks: { afterWrite: (t: unknown) => Promise<void> }) => {
      await hooks.afterWrite(tx);
      return preview;
    });

    const res = await post({ toResidency: "Hosteller" });
    expect(res.status).toBe(200);

    expect(mockUpsertFee).toHaveBeenCalledTimes(1);
    expect(mockUpsertFee.mock.calls[0]![0]).toBe(tx); // the transaction client, not the global one
    expect(mockUpsertFee.mock.calls[0]![1]).toEqual({
      schoolId: "s1",
      studentId: "stu1",
      classId: "c1",
      section: "A",
      discountPercent: 12.5,
      amountPaid: 4000,
      residencyType: "Hosteller",
    });
    expect(mockInvalidateFeeCaches).toHaveBeenCalledWith({ studentId: "stu1", schoolId: "s1" });
  });

  it("rolls back the conversion (500) when the recalculation fails, and clears no caches", async () => {
    mockApply.mockRejectedValue(new Error("recalc failed"));
    const res = await post({ toResidency: "Hosteller" });
    expect(res.status).toBe(500);
    expect(mockInvalidateFeeCaches).not.toHaveBeenCalled();
  });

  it("passes a valid convertedOn date through and ignores a malformed one", async () => {
    await post({ toResidency: "Hosteller", convertedOn: "2026-10-07" });
    expect(mockApply.mock.calls[0]![1]).toMatchObject({ convertedOn: "2026-10-07" });

    await post({ toResidency: "Hosteller", convertedOn: "07/10/2026" });
    expect(mockApply.mock.calls[1]![1].convertedOn).toBeUndefined();
  });

  it("reports a missing transport slab as 400 with the code and preview", async () => {
    mockStudentFindFirst.mockResolvedValue({ id: "stu1", residencyType: "Hosteller", classId: "c1", class: { section: "A" } });
    mockApply.mockRejectedValue(
      Object.assign(new Error("Choose the transport kilometre slab"), { code: "TRANSPORT_REQUIRED", preview })
    );
    const res = await post({ toResidency: "Day Scholar" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("TRANSPORT_REQUIRED");
    expect(json.preview).toEqual(preview);
    expect(mockInvalidateFeeCaches).not.toHaveBeenCalled();
  });
});
