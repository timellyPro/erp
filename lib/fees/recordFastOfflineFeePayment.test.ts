const mockStudentFindUnique = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockTransaction = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...a: unknown[]) => mockStudentFindUnique(...a) },
    extraFee: { findMany: (...a: unknown[]) => mockExtraFeeFindMany(...a) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));

// `after()` only works inside a Next.js request; outside one it throws and the code runs the work directly.
jest.mock("next/server", () => ({
  after: () => {
    throw new Error("`after` was called outside a request scope");
  },
}));

const mockBreakdown = jest.fn();
jest.mock("@/lib/fees/computeAdminStudentFeeBreakdown", () => ({
  computeAdminStudentFeeBreakdown: (...a: unknown[]) => mockBreakdown(...a),
}));

const mockReconcile = jest.fn();
jest.mock("@/lib/fees/reconcileStudentFeeIntegrity", () => ({
  reconcileStudentFeeIntegrity: (...a: unknown[]) => mockReconcile(...a),
}));

const mockInvalidate = jest.fn();
jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...a: unknown[]) => mockInvalidate(...a),
}));

import {
  canUseFastOfflineFeePayment,
  recordFastOfflineFeePayment,
  type OfflineExplicitAllocation,
  type OfflineSelectedHead,
} from "./recordFastOfflineFeePayment";

/** In-memory fake of the Prisma transaction client used inside $transaction. */
const tx = {
  payment: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  paymentFeeAllocation: { findMany: jest.fn(), createMany: jest.fn() },
  extraFee: { findMany: jest.fn() },
  studentFee: { updateMany: jest.fn() },
};

const baseHeads: OfflineSelectedHead[] = [
  { headType: "BASE_COMPONENT", componentIndex: 0, componentName: "Tuition" },
  { headType: "EXTRA_FEE", extraFeeId: "ex1" },
];

const fee = { amountPaid: 1000, remainingFee: 4000, finalFee: 5000, totalFee: 5000 };

function input(overrides: Record<string, unknown> = {}) {
  const selectedHeads = baseHeads;
  const explicitAllocations: OfflineExplicitAllocation[] = [
    { key: "BASE:0", amount: 1500 },
    { key: "EXTRA:ex1", amount: 500, label: "Bus Fee" },
  ];
  return {
    schoolId: "sch1",
    studentId: "st1",
    amount: 2000,
    selectedHeads,
    explicitAllocations,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStudentFindUnique.mockResolvedValue({ id: "st1", schoolId: "sch1", fee });
  mockBreakdown.mockResolvedValue({
    dueHeads: [
      { key: "BASE:0", dueBefore: 3000 },
      { key: "EXTRA:ex1", dueBefore: 1000 },
    ],
  });
  mockExtraFeeFindMany.mockResolvedValue([]);
  mockTransaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  tx.payment.findMany.mockResolvedValue([]);
  tx.payment.findUnique.mockResolvedValue(null);
  tx.payment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "pay1", ...data }));
  tx.paymentFeeAllocation.createMany.mockResolvedValue({ count: 2 });
  tx.studentFee.updateMany.mockResolvedValue({ count: 1 });
  mockReconcile.mockResolvedValue({
    after: { amountPaid: 3000, remainingFee: 2000, finalFee: 5000, totalFee: 5000 },
  });
});

describe("recordFastOfflineFeePayment validation", () => {
  it("rejects an allocation whose head was not selected", async () => {
    await expect(
      recordFastOfflineFeePayment(input({ explicitAllocations: [{ key: "BASE:9", amount: 2000 }] }))
    ).rejects.toThrow("Head BASE:9 must be present in selectedHeads");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects when head-wise amounts do not add up to the payment amount", async () => {
    await expect(recordFastOfflineFeePayment(input({ amount: 2500 }))).rejects.toThrow(
      /must equal payment amount/
    );
    expect(mockStudentFindUnique).not.toHaveBeenCalled();
  });

  it("allows a sub-paisa rounding difference in the sum", async () => {
    await expect(
      recordFastOfflineFeePayment(
        input({
          amount: 2000,
          explicitAllocations: [
            { key: "BASE:0", amount: 1500.004 },
            { key: "EXTRA:ex1", amount: 500 },
          ],
        })
      )
    ).resolves.toBeDefined();
  });

  it("rejects when the student is missing, has no fee, or belongs to another school", async () => {
    mockStudentFindUnique.mockResolvedValueOnce(null);
    await expect(recordFastOfflineFeePayment(input())).rejects.toThrow("Student or fee record not found");

    mockStudentFindUnique.mockResolvedValueOnce({ id: "st1", schoolId: "other", fee });
    await expect(recordFastOfflineFeePayment(input())).rejects.toThrow("Student or fee record not found");

    mockStudentFindUnique.mockResolvedValueOnce({ id: "st1", schoolId: "sch1", fee: null });
    await expect(recordFastOfflineFeePayment(input())).rejects.toThrow("Student or fee record not found");

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects an amount above the total remaining due", async () => {
    mockBreakdown.mockResolvedValue({
      dueHeads: [
        { key: "BASE:0", dueBefore: 1000 },
        { key: "EXTRA:ex1", dueBefore: 500 },
      ],
    });
    await expect(recordFastOfflineFeePayment(input())).rejects.toThrow(/cannot exceed remaining due/);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects an amount above one head's due even when the total fits", async () => {
    mockBreakdown.mockResolvedValue({
      dueHeads: [
        { key: "BASE:0", dueBefore: 1000 },
        { key: "EXTRA:ex1", dueBefore: 5000 },
      ],
    });
    await expect(recordFastOfflineFeePayment(input())).rejects.toThrow(/Amount for BASE:0 exceeds due/);
  });

  it("rejects a head key that has no due entry", async () => {
    mockBreakdown.mockResolvedValue({ dueHeads: [{ key: "BASE:0", dueBefore: 3000 }, { key: "OTHER", dueBefore: 3000 }] });
    await expect(recordFastOfflineFeePayment(input())).rejects.toThrow("Invalid fee head key: EXTRA:ex1");
  });

  it("rejects an invalid paymentDate before opening a transaction", async () => {
    await expect(recordFastOfflineFeePayment(input({ paymentDate: "31/02/2026" }))).rejects.toThrow("Invalid paymentDate");
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe("recordFastOfflineFeePayment new payment", () => {
  it("creates the payment, allocations and fee update, then reconciles", async () => {
    const res = await recordFastOfflineFeePayment(input({ collectedByUserId: "u9", collectedByName: "Clerk" }));

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: {
        studentId: "st1",
        amount: 2000,
        gateway: "OFFLINE_CASH",
        status: "SUCCESS",
        transactionId: null,
        clientRequestId: null,
        collectedByUserId: "u9",
        collectedByName: "Clerk",
      },
    });

    const created = tx.paymentFeeAllocation.createMany.mock.calls[0][0].data;
    expect(created).toEqual([
      expect.objectContaining({
        paymentId: "pay1",
        allocationType: "PAYMENT",
        allocatedAmount: 1500,
        headType: "BASE_COMPONENT",
        componentIndex: 0,
        componentName: "Tuition",
        extraFeeId: null,
      }),
      expect.objectContaining({
        paymentId: "pay1",
        allocatedAmount: 500,
        headType: "EXTRA_FEE",
        componentIndex: null,
        componentName: "Bus Fee",
        extraFeeId: "ex1",
      }),
    ]);

    expect(tx.studentFee.updateMany).toHaveBeenCalledWith({
      where: { studentId: "st1" },
      data: { amountPaid: 3000, remainingFee: 2000 },
    });
    expect(mockReconcile).toHaveBeenCalledWith("sch1", "st1", { repairAllocations: true, apply: true });
    expect(res.idempotent).toBe(false);
    expect(res.appendedToExistingRef).toBe(false);
    expect(res.updatedFee).toEqual({ amountPaid: 3000, remainingFee: 2000, finalFee: 5000, totalFee: 5000 });
    expect(res.feeAllocations).toEqual([
      { name: "Tuition", amount: 1500, key: "BASE:0" },
      { name: "Bus Fee", amount: 500, key: "EXTRA:ex1" },
    ]);
  });

  it("omits collector fields when they are not provided", async () => {
    await recordFastOfflineFeePayment(input());
    const data = tx.payment.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("collectedByUserId");
    expect(data).not.toHaveProperty("collectedByName");
    expect(data).not.toHaveProperty("createdAt");
  });

  it.each([
    [undefined, "OFFLINE_CASH"],
    ["upi", "OFFLINE_UPI"],
    ["cheque", "OFFLINE_CHEQUE"],
    ["OFFLINE_DD", "OFFLINE_DD"],
    ["  ", "OFFLINE_CASH"],
  ])("stores payment mode %j as %s", async (paymentMode, gateway) => {
    await recordFastOfflineFeePayment(input({ paymentMode }));
    expect(tx.payment.create.mock.calls[0][0].data.gateway).toBe(gateway);
  });

  it("stores the trimmed transactionId, falling back to refNo", async () => {
    await recordFastOfflineFeePayment(input({ transactionId: "  TXN1 ", refNo: "REF1" }));
    expect(tx.payment.create.mock.calls[0][0].data.transactionId).toBe("TXN1");

    tx.payment.create.mockClear();
    await recordFastOfflineFeePayment(input({ refNo: "REF1" }));
    expect(tx.payment.create.mock.calls[0][0].data.transactionId).toBe("REF1");
  });

  it("backdates the payment to noon UTC of the chosen day", async () => {
    await recordFastOfflineFeePayment(input({ paymentDate: "2026-03-05" }));
    expect(tx.payment.create.mock.calls[0][0].data.createdAt).toEqual(new Date("2026-03-05T12:00:00.000Z"));
  });

  it("floors remainingFee at zero when the payment exceeds the final fee", async () => {
    mockStudentFindUnique.mockResolvedValue({
      id: "st1",
      schoolId: "sch1",
      fee: { amountPaid: 4500, remainingFee: 500, finalFee: 5000, totalFee: 5000 },
    });
    mockBreakdown.mockResolvedValue({
      dueHeads: [
        { key: "BASE:0", dueBefore: 3000 },
        { key: "EXTRA:ex1", dueBefore: 1000 },
      ],
    });
    await recordFastOfflineFeePayment(input());
    expect(tx.studentFee.updateMany).toHaveBeenCalledWith({
      where: { studentId: "st1" },
      data: { amountPaid: 6500, remainingFee: 0 },
    });
  });

  it("looks up extra-fee names, scoped to the school, only when no label is given", async () => {
    mockExtraFeeFindMany.mockResolvedValue([{ id: "ex1", name: "Transport" }]);
    const res = await recordFastOfflineFeePayment(
      input({
        explicitAllocations: [
          { key: "BASE:0", amount: 1500 },
          { key: "EXTRA:ex1", amount: 500 },
        ],
      })
    );
    expect(mockExtraFeeFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["ex1"] }, schoolId: "sch1" },
      select: { id: true, name: true },
    });
    expect(res.feeAllocations?.[1].name).toBe("Transport");
  });

  it("does not look up extra-fee names when every extra has a label", async () => {
    await recordFastOfflineFeePayment(input());
    expect(mockExtraFeeFindMany).not.toHaveBeenCalled();
  });

  it("uses a placeholder name for an unknown extra fee", async () => {
    const res = await recordFastOfflineFeePayment(
      input({
        explicitAllocations: [
          { key: "BASE:0", amount: 1500 },
          { key: "EXTRA:ex1", amount: 500 },
        ],
      })
    );
    expect(res.feeAllocations?.[1].name).toBe("Extra Fee");
  });

  it("names an unnamed base component by its position", async () => {
    mockBreakdown.mockResolvedValue({ dueHeads: [{ key: "BASE:2", dueBefore: 3000 }] });
    const res = await recordFastOfflineFeePayment(
      input({
        selectedHeads: [{ headType: "BASE_COMPONENT", componentIndex: 2 }],
        explicitAllocations: [{ key: "BASE:2", amount: 2000 }],
      })
    );
    expect(tx.paymentFeeAllocation.createMany.mock.calls[0][0].data[0].componentName).toBe("Component-3");
    expect(res.feeAllocations).toEqual([{ name: "Component-3", amount: 2000, key: "BASE:2" }]);
  });

  it("fails the whole payment when the fee row was changed concurrently", async () => {
    tx.studentFee.updateMany.mockResolvedValue({ count: 0 });
    await expect(recordFastOfflineFeePayment(input())).rejects.toThrow("Fee record was updated concurrently");
  });

  it("falls back to invalidating read caches when integrity reconciliation returns nothing", async () => {
    mockReconcile.mockResolvedValue(null);
    const res = await recordFastOfflineFeePayment(input());
    expect(mockInvalidate).toHaveBeenCalledWith({ studentId: "st1", schoolId: "sch1" });
    expect(res.updatedFee).toEqual({ amountPaid: 3000, remainingFee: 2000, finalFee: 5000, totalFee: 5000 });
  });

  it("runs the writes inside a transaction with the extended fee timeouts", async () => {
    await recordFastOfflineFeePayment(input());
    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 15_000, timeout: 30_000 });
  });
});

describe("recordFastOfflineFeePayment reused reference", () => {
  const existing = { id: "payOld", amount: 1500, gateway: "OFFLINE_UPI" };

  it("returns the existing payment unchanged for an exact duplicate", async () => {
    tx.payment.findMany.mockResolvedValue([existing]);
    tx.paymentFeeAllocation.findMany.mockResolvedValue([
      { headType: "BASE_COMPONENT", componentIndex: 0, extraFeeId: null, componentName: "Tuition", allocatedAmount: 1500 },
      { headType: "EXTRA_FEE", componentIndex: null, extraFeeId: "ex1", componentName: "Bus", allocatedAmount: 500 },
    ]);
    tx.extraFee.findMany.mockResolvedValue([{ id: "ex1", name: "Bus Fee" }]);

    const res = await recordFastOfflineFeePayment(input({ refNo: "UTR1" }));

    expect(res.idempotent).toBe(true);
    expect(res.payment).toBe(existing);
    expect(res.updatedFee).toEqual({ amountPaid: 1000, remainingFee: 4000, finalFee: 5000, totalFee: 5000 });
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.paymentFeeAllocation.createMany).not.toHaveBeenCalled();
    expect(tx.studentFee.updateMany).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(res.feeAllocations).toEqual([
      { name: "Tuition", amount: 1500, key: "BASE:0" },
      { name: "Bus Fee", amount: 500, key: "EXTRA:ex1" },
    ]);
  });

  it("ignores an earlier online payment that happens to share the reference", async () => {
    tx.payment.findMany.mockResolvedValue([{ id: "online", amount: 2000, gateway: "HYPERPG" }]);
    const res = await recordFastOfflineFeePayment(input({ refNo: "UTR1" }));
    expect(res.idempotent).toBe(false);
    expect(tx.payment.create).toHaveBeenCalled();
  });

  it("appends only the additional head to the existing payment", async () => {
    tx.payment.findMany.mockResolvedValue([existing]);
    tx.paymentFeeAllocation.findMany.mockResolvedValue([
      { headType: "BASE_COMPONENT", componentIndex: 0, extraFeeId: null, componentName: "Tuition", allocatedAmount: 1500 },
    ]);
    tx.payment.update.mockImplementation(async ({ data }: { data: { amount: number } }) => ({ ...existing, ...data }));

    const res = await recordFastOfflineFeePayment(input({ refNo: "UTR1" }));

    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.paymentFeeAllocation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ paymentId: "payOld", allocatedAmount: 500, headType: "EXTRA_FEE", extraFeeId: "ex1" }),
      ],
    });
    expect(tx.payment.update).toHaveBeenCalledWith({ where: { id: "payOld" }, data: { amount: 2000 } });
    expect(tx.studentFee.updateMany).toHaveBeenCalledWith({
      where: { studentId: "st1" },
      data: { amountPaid: 1500, remainingFee: 3500 },
    });
    expect(res.appendedToExistingRef).toBe(true);
    expect(res.idempotent).toBe(false);
    expect(res.feeAllocations).toEqual([{ name: "Bus Fee", amount: 500, key: "EXTRA:ex1" }]);
    expect(mockReconcile).toHaveBeenCalled();
  });

  it("fails an append when the fee row was changed concurrently", async () => {
    tx.payment.findMany.mockResolvedValue([existing]);
    tx.paymentFeeAllocation.findMany.mockResolvedValue([]);
    tx.payment.update.mockResolvedValue(existing);
    tx.studentFee.updateMany.mockResolvedValue({ count: 0 });
    await expect(recordFastOfflineFeePayment(input({ refNo: "UTR1" }))).rejects.toThrow(
      "Fee record was updated concurrently"
    );
  });
});

describe("recordFastOfflineFeePayment clientRequestId idempotency", () => {
  it("stores the clientRequestId on a new payment", async () => {
    await recordFastOfflineFeePayment(input({ clientRequestId: "  attempt-1  " }));
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientRequestId: "attempt-1" }) })
    );
  });

  it("returns the existing payment as idempotent on a retry with the same clientRequestId, without writing again", async () => {
    const existing = { id: "pay1", amount: 2000, gateway: "OFFLINE_CASH", clientRequestId: "attempt-1" };
    tx.payment.findUnique.mockResolvedValue(existing);
    tx.paymentFeeAllocation.findMany.mockResolvedValue([
      { headType: "BASE_COMPONENT", componentIndex: 0, extraFeeId: null, componentName: "Tuition", allocatedAmount: 1500 },
    ]);

    const res = await recordFastOfflineFeePayment(input({ clientRequestId: "attempt-1" }));

    expect(tx.payment.findUnique).toHaveBeenCalledWith({ where: { clientRequestId: "attempt-1" } });
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.studentFee.updateMany).not.toHaveBeenCalled();
    expect(res.idempotent).toBe(true);
    expect(res.payment).toBe(existing);
    expect(res.updatedFee).toEqual({ amountPaid: 1000, remainingFee: 4000, finalFee: 5000, totalFee: 5000 });
  });

  it("does not look up by clientRequestId when none is provided", async () => {
    await recordFastOfflineFeePayment(input());
    expect(tx.payment.findUnique).not.toHaveBeenCalled();
  });
});

describe("canUseFastOfflineFeePayment", () => {
  it("requires both selected heads and explicit allocations", () => {
    const alloc = [{ key: "BASE:0", amount: 1 }];
    expect(canUseFastOfflineFeePayment(baseHeads, alloc)).toBe(true);
    expect(canUseFastOfflineFeePayment([], alloc)).toBe(false);
    expect(canUseFastOfflineFeePayment(baseHeads, [])).toBe(false);
  });
});
