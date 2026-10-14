/**
 * @jest-environment node
 */
import { POST } from "@/app/api/fees/offline-payment/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockResolveOfflinePaymentCollectorFromSession = jest.fn();
const mockCanUseFastOfflineFeePayment = jest.fn();
const mockRecordFastOfflineFeePayment = jest.fn();
const mockLoadExtraFeesForStudentScope = jest.fn();
const mockFindExistingOfflinePaymentByRef = jest.fn();
const mockPlanSameRefPayment = jest.fn();
const mockReconcileStudentFeeIntegrity = jest.fn();
const mockInvalidateStudentFeeReadCaches = jest.fn();

const mockStudentFindUnique = jest.fn();
const mockClassFeeStructureFindUnique = jest.fn();
const mockAllocationGroupBy = jest.fn();
const mockAllocationFindMany = jest.fn();
const mockStudentFeeFindUnique = jest.fn();
const mockStudentFeeUpdate = jest.fn();
const mockPaymentCreate = jest.fn();
const mockPaymentUpdate = jest.fn();
const mockAllocationCreateMany = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockTransaction = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/fees/offlinePaymentCollector", () => ({
  resolveOfflinePaymentCollectorFromSession: (...args: unknown[]) =>
    mockResolveOfflinePaymentCollectorFromSession(...args),
}));

jest.mock("@/lib/fees/recordFastOfflineFeePayment", () => ({
  canUseFastOfflineFeePayment: (...args: unknown[]) => mockCanUseFastOfflineFeePayment(...args),
  recordFastOfflineFeePayment: (...args: unknown[]) => mockRecordFastOfflineFeePayment(...args),
}));

jest.mock("@/lib/fees/loadExtraFeesForStudentScope", () => ({
  loadExtraFeesForStudentScope: (...args: unknown[]) => mockLoadExtraFeesForStudentScope(...args),
}));

const mockFindExistingPaymentByClientRequestId = jest.fn().mockResolvedValue(null);

jest.mock("@/lib/fees/offlinePaymentIdempotency", () => ({
  findExistingOfflinePaymentByRef: (...args: unknown[]) => mockFindExistingOfflinePaymentByRef(...args),
  findExistingPaymentByClientRequestId: (...args: unknown[]) =>
    mockFindExistingPaymentByClientRequestId(...args),
  resolveOfflinePaymentTransactionId: (transactionId?: string | null, refNo?: string | null) =>
    (typeof transactionId === "string" && transactionId.trim()) ||
    (typeof refNo === "string" && refNo.trim()) ||
    null,
}));

jest.mock("@/lib/fees/offlinePaymentSameRef", () => ({
  planSameRefPayment: (...args: unknown[]) => mockPlanSameRefPayment(...args),
}));

jest.mock("@/lib/fees/reconcileStudentFeeIntegrity", () => ({
  reconcileStudentFeeIntegrity: (...args: unknown[]) => mockReconcileStudentFeeIntegrity(...args),
}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...args: unknown[]) => mockInvalidateStudentFeeReadCaches(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    classFeeStructure: { findUnique: (...args: unknown[]) => mockClassFeeStructureFindUnique(...args) },
    paymentFeeAllocation: {
      groupBy: (...args: unknown[]) => mockAllocationGroupBy(...args),
      findMany: (...args: unknown[]) => mockAllocationFindMany(...args),
    },
    studentFee: {
      findUnique: (...args: unknown[]) => mockStudentFeeFindUnique(...args),
      update: (...args: unknown[]) => mockStudentFeeUpdate(...args),
    },
    payment: {
      create: (...args: unknown[]) => mockPaymentCreate(...args),
      update: (...args: unknown[]) => mockPaymentUpdate(...args),
    },
    extraFee: { findMany: (...args: unknown[]) => mockExtraFeeFindMany(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const request = (body: unknown) =>
  new Request("http://localhost/api/fees/offline-payment", {
    method: "POST",
    body: JSON.stringify(body),
  });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const validBody = { studentId: "stu1", amount: 500, paymentMode: "CASH" };

const studentWithOneComponent = {
  id: "stu1",
  schoolId: "s1",
  residencyType: "Day Scholar",
  class: { id: "c1", section: "A" },
  fee: {
    amountPaid: 0,
    finalFee: 1000,
    totalFee: 1000,
    discountPercent: 0,
    discountFeeHeadKey: null,
    discountFeeHeadLabel: null,
  },
};

function txMockFor(overrides: Record<string, unknown> = {}) {
  const tx = {
    payment: {
      create: jest.fn().mockResolvedValue({ id: "pay1", amount: 500 }),
      update: jest.fn(),
    },
    paymentFeeAllocation: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    studentFee: {
      update: jest.fn().mockResolvedValue({
        studentId: "stu1",
        amountPaid: 500,
        remainingFee: 500,
        finalFee: 1000,
        totalFee: 1000,
      }),
      findUnique: jest.fn(),
    },
    ...overrides,
  };
  return tx;
}

describe("POST /api/fees/offline-payment", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockResolveOfflinePaymentCollectorFromSession.mockReset().mockReturnValue({
      collectedByUserId: "u1",
      collectedByName: "Admin One",
    });
    mockCanUseFastOfflineFeePayment.mockReset().mockReturnValue(false);
    mockRecordFastOfflineFeePayment.mockReset();
    mockLoadExtraFeesForStudentScope.mockReset().mockResolvedValue([]);
    mockFindExistingOfflinePaymentByRef.mockReset().mockResolvedValue(null);
    mockFindExistingPaymentByClientRequestId.mockReset().mockResolvedValue(null);
    mockPlanSameRefPayment.mockReset();
    mockReconcileStudentFeeIntegrity.mockReset().mockResolvedValue(undefined);
    mockInvalidateStudentFeeReadCaches.mockReset();

    mockStudentFindUnique.mockReset();
    mockClassFeeStructureFindUnique.mockReset().mockResolvedValue(null);
    mockAllocationGroupBy.mockReset().mockResolvedValue([]);
    mockAllocationFindMany.mockReset().mockResolvedValue([]);
    mockStudentFeeFindUnique.mockReset();
    mockStudentFeeUpdate.mockReset();
    mockPaymentCreate.mockReset();
    mockPaymentUpdate.mockReset();
    mockAllocationCreateMany.mockReset();
    mockExtraFeeFindMany.mockReset().mockResolvedValue([]);
    mockTransaction.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid (non-JSON-object) body", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const req = new Request("http://localhost/api/fees/offline-payment", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when studentId or amount is missing/invalid", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(request({ studentId: "stu1", amount: -5 }));
    expect(res.status).toBe(400);
  });

  describe("fast path", () => {
    beforeEach(() => {
      mockCanUseFastOfflineFeePayment.mockReturnValue(true);
    });

    it("records a new fast payment and returns 201", async () => {
      mockGetServerSession.mockResolvedValue(adminSession);
      mockRecordFastOfflineFeePayment.mockResolvedValue({
        payment: { id: "pay1" },
        idempotent: false,
        appendedToExistingRef: false,
      });
      const res = await POST(request(validBody));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.message).toBe("Payment recorded successfully");
    });

    it("returns 200 with an idempotent message when the reference was already recorded", async () => {
      mockGetServerSession.mockResolvedValue(adminSession);
      mockRecordFastOfflineFeePayment.mockResolvedValue({
        payment: { id: "pay1" },
        idempotent: true,
        appendedToExistingRef: false,
      });
      const res = await POST(request(validBody));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toMatch(/already recorded/i);
    });

    it("returns 201 with an appended message when heads are linked to an existing reference", async () => {
      mockGetServerSession.mockResolvedValue(adminSession);
      mockRecordFastOfflineFeePayment.mockResolvedValue({
        payment: { id: "pay1" },
        idempotent: false,
        appendedToExistingRef: true,
      });
      const res = await POST(request(validBody));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.message).toMatch(/linked to the existing/i);
    });

    it("maps a 'not found' fast-path error to 404", async () => {
      mockGetServerSession.mockResolvedValue(adminSession);
      mockRecordFastOfflineFeePayment.mockRejectedValue(new Error("Student not found"));
      const res = await POST(request(validBody));
      expect(res.status).toBe(404);
    });

    it("maps an unrelated fast-path error to 400", async () => {
      mockGetServerSession.mockResolvedValue(adminSession);
      mockRecordFastOfflineFeePayment.mockRejectedValue(new Error("Amount exceeds due"));
      const res = await POST(request(validBody));
      expect(res.status).toBe(400);
    });
  });

  describe("slow (full allocation) path", () => {
    it("returns 404 when the student is not in the caller's school", async () => {
      mockGetServerSession.mockResolvedValue(adminSession);
      mockStudentFindUnique.mockResolvedValue({ ...studentWithOneComponent, schoolId: "other-school" });
      const res = await POST(request(validBody));
      expect(res.status).toBe(404);
    });

    it("returns 404 when the student has no fee record", async () => {
      mockGetServerSession.mockResolvedValue(adminSession);
      mockStudentFindUnique.mockResolvedValue({ ...studentWithOneComponent, fee: null });
      const res = await POST(request(validBody));
      expect(res.status).toBe(404);
    });

    it("returns 400 when there are no fee heads configured for the student", async () => {
      mockGetServerSession.mockResolvedValue(adminSession);
      mockStudentFindUnique.mockResolvedValue(studentWithOneComponent);
      mockClassFeeStructureFindUnique.mockResolvedValue({ components: [] });
      const res = await POST(request(validBody));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toMatch(/no fee heads configured/i);
    });

    it("returns 400 when the amount exceeds the total due", async () => {
      mockGetServerSession.mockResolvedValue(adminSession);
      mockStudentFindUnique.mockResolvedValue(studentWithOneComponent);
      mockClassFeeStructureFindUnique.mockResolvedValue({
        components: [{ name: "Tuition", amount: 1000 }],
      });
      const res = await POST(request({ ...validBody, amount: 5000 }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toMatch(/cannot exceed remaining due/i);
    });

    it("records a full payment against the single base component and reconciles integrity", async () => {
      mockGetServerSession.mockResolvedValue(adminSession);
      mockStudentFindUnique.mockResolvedValue(studentWithOneComponent);
      mockClassFeeStructureFindUnique.mockResolvedValue({
        components: [{ name: "Tuition", amount: 1000 }],
      });
      const tx = txMockFor();
      mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
      mockStudentFeeFindUnique.mockResolvedValue({
        amountPaid: 500,
        remainingFee: 500,
        finalFee: 1000,
        totalFee: 1000,
      });

      const res = await POST(request({ ...validBody, amount: 500 }));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.message).toBe("Payment recorded successfully");
      expect(json.updatedFee.amountPaid).toBe(500);
      expect(json.updatedFee.remainingFee).toBe(500);
      expect(json.feeAllocations).toEqual([{ name: "Tuition", amount: 500 }]);

      expect(tx.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: "stu1",
            amount: 500,
            status: "SUCCESS",
            collectedByUserId: "u1",
            collectedByName: "Admin One",
          }),
        })
      );
      expect(tx.paymentFeeAllocation.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            paymentId: "pay1",
            allocatedAmount: 500,
            headType: "BASE_COMPONENT",
            componentIndex: 0,
          }),
        ],
      });
      expect(mockReconcileStudentFeeIntegrity).toHaveBeenCalledWith("s1", "stu1", {
        repairAllocations: true,
        apply: true,
      });
    });

    it("returns the existing payment as idempotent on a retry with the same clientRequestId, without writing again", async () => {
      mockGetServerSession.mockResolvedValue(adminSession);
      mockStudentFindUnique.mockResolvedValue(studentWithOneComponent);
      mockClassFeeStructureFindUnique.mockResolvedValue({
        components: [{ name: "Tuition", amount: 1000 }],
      });
      const tx = txMockFor();
      mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
      const existingPayment = { id: "pay-existing", amount: 500, status: "SUCCESS" };
      mockFindExistingPaymentByClientRequestId.mockResolvedValue(existingPayment);
      tx.studentFee.findUnique.mockResolvedValue({
        amountPaid: 500,
        remainingFee: 500,
        finalFee: 1000,
        totalFee: 1000,
      });

      const res = await POST(request({ ...validBody, amount: 500, clientRequestId: "attempt-1" }));

      expect(mockFindExistingPaymentByClientRequestId).toHaveBeenCalledWith(tx, "attempt-1");
      expect(tx.payment.create).not.toHaveBeenCalled();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.payment).toEqual(existingPayment);
      expect(json.message).toMatch(/already recorded/i);
    });
  });
});
