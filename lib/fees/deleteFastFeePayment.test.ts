/**
 * @jest-environment node
 */
import { deleteFastFeePayment } from "@/lib/fees/deleteFastFeePayment";

const mockPaymentFindFirst = jest.fn();
const mockSubscriptionCount = jest.fn();
const mockRefundFindFirst = jest.fn();
const mockTransaction = jest.fn();
const mockReconcile = jest.fn();
const mockInvalidate = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    payment: { findFirst: (...a: unknown[]) => mockPaymentFindFirst(...a) },
    parentSubscription: { count: (...a: unknown[]) => mockSubscriptionCount(...a) },
    refund: { findFirst: (...a: unknown[]) => mockRefundFindFirst(...a) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));

jest.mock("@/lib/fees/prismaFeeMutationTx", () => ({ FEE_MUTATION_TX: { timeout: 1 } }));
jest.mock("@/lib/fees/reconcileStudentFeeFromPayments", () => ({
  reconcileStudentFeeTotalsFromPayments: (...a: unknown[]) => mockReconcile(...a),
}));
jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...a: unknown[]) => mockInvalidate(...a),
}));

const payment = {
  id: "pay1",
  studentId: "stu1",
  amount: 5000,
  status: "SUCCESS",
  purpose: "FEES",
  gateway: "OFFLINE_CASH",
  transactionId: "UTR-9",
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
  collectedByName: "Front desk",
  eventRegistrationId: null,
  student: { schoolId: "s1" },
};

const actor = { userId: "u1", name: "Asha Admin", role: "SCHOOLADMIN" };

function makeTx(order: string[], opts?: { auditFails?: boolean }) {
  return {
    paymentFeeAllocation: {
      findMany: jest.fn().mockResolvedValue([
        { headType: "EXTRA_FEE", componentName: "Mess Fee (1st Installment)", componentIndex: null, extraFeeId: "x1", allocationType: "PAYMENT", allocatedAmount: 5000 },
      ]),
    },
    paymentAuditLog: {
      create: jest.fn(async (_args: { data: Record<string, unknown> }) => {
        order.push("audit");
        if (opts?.auditFails) throw new Error("audit down");
      }),
    },
    payment: {
      delete: jest.fn(async () => {
        order.push("delete");
      }),
    },
  };
}

describe("deleteFastFeePayment", () => {
  beforeEach(() => {
    mockPaymentFindFirst.mockReset().mockResolvedValue(payment);
    mockSubscriptionCount.mockReset().mockResolvedValue(0);
    mockRefundFindFirst.mockReset().mockResolvedValue(null);
    mockTransaction.mockReset();
    mockReconcile.mockReset().mockResolvedValue({ amountPaid: 0, remainingFee: 1000, finalFee: 1000 });
    mockInvalidate.mockReset();
  });

  it("writes the audit row with a full snapshot and the actor, then deletes, in one transaction", async () => {
    const order: string[] = [];
    const tx = makeTx(order);
    mockTransaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    const result = await deleteFastFeePayment("pay1", "s1", undefined, actor);

    expect(order).toEqual(["audit", "delete"]);
    const data = tx.paymentAuditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      schoolId: "s1",
      paymentId: "pay1",
      studentId: "stu1",
      action: "DELETE",
      actorUserId: "u1",
      actorName: "Asha Admin",
      actorRole: "SCHOOLADMIN",
      summary: "Deleted payment of 5000 (ref UTR-9)",
    });
    expect(data.before).toMatchObject({ id: "pay1", amount: 5000, transactionId: "UTR-9", allocationCount: 1 });
    expect((data.before as { allocations: Array<Record<string, unknown>> }).allocations[0]).toMatchObject({
      name: "Mess Fee (1st Installment)",
      amount: 5000,
    });
    expect(result.paymentId).toBe("pay1");
    expect(mockReconcile).toHaveBeenCalledWith("stu1");
    expect(mockInvalidate).toHaveBeenCalledWith({ studentId: "stu1", schoolId: "s1" });
  });

  it("still records the delete when the actor is unknown", async () => {
    const order: string[] = [];
    const tx = makeTx(order);
    mockTransaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
    await deleteFastFeePayment("pay1", "s1");
    expect(tx.paymentAuditLog.create.mock.calls[0][0].data).toMatchObject({ actorUserId: null, actorName: null });
  });

  it("does not delete, reconcile or invalidate when the audit row cannot be written", async () => {
    const order: string[] = [];
    const tx = makeTx(order, { auditFails: true });
    mockTransaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
    await expect(deleteFastFeePayment("pay1", "s1", undefined, actor)).rejects.toThrow("audit down");
    expect(tx.payment.delete).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it("is blocked, and leaves no audit row, when the payment has refunds", async () => {
    mockRefundFindFirst.mockResolvedValue({ id: "r1" });
    await expect(deleteFastFeePayment("pay1", "s1", undefined, actor)).rejects.toThrow(/refund/i);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses a payment that belongs to another school", async () => {
    mockPaymentFindFirst.mockResolvedValue({ ...payment, student: { schoolId: "other" } });
    await expect(deleteFastFeePayment("pay1", "s1", undefined, actor)).rejects.toThrow("Payment not found");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("does not realign student totals for a payment that never succeeded", async () => {
    mockPaymentFindFirst.mockResolvedValue({ ...payment, status: "PENDING" });
    const order: string[] = [];
    const tx = makeTx(order);
    mockTransaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
    await deleteFastFeePayment("pay1", "s1", undefined, actor);
    expect(order).toEqual(["audit", "delete"]);
    expect(mockReconcile).not.toHaveBeenCalled();
  });
});
