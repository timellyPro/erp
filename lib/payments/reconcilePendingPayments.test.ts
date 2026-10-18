/**
 * @jest-environment node
 */
import { reconcilePendingPayments } from "@/lib/payments/reconcilePendingPayments";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (_id: string, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));
jest.mock("@/lib/fees/feeListServerCache", () => ({ invalidateFeeListServerCaches: jest.fn() }));

const mockCount = jest.fn();
const mockFindMany = jest.fn();
const mockUpdateMany = jest.fn();
const mockFeeFind = jest.fn();
const mockFeeUpdate = jest.fn();
const mockRegUpdate = jest.fn();
const mockAuditCreate = jest.fn();

jest.mock("@/lib/db", () => {
  const tx = {
    paymentAuditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
    payment: { updateMany: (...a: unknown[]) => mockUpdateMany(...a) },
    studentFee: {
      findUnique: (...a: unknown[]) => mockFeeFind(...a),
      update: (...a: unknown[]) => mockFeeUpdate(...a),
    },
    eventRegistration: { update: (...a: unknown[]) => mockRegUpdate(...a) },
  };
  return {
    __esModule: true,
    default: {
      payment: {
        count: (...a: unknown[]) => mockCount(...a),
        findMany: (...a: unknown[]) => mockFindMany(...a),
      },
      schoolSettings: {
        findUnique: jest.fn().mockResolvedValue({ hyperpgMerchantId: "m", hyperpgApiKey: "k" }),
      },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

const pendingPayment = {
  id: "p1",
  studentId: "s1",
  amount: 500,
  transactionId: "TML1",
  eventRegistrationId: null,
  student: { schoolId: "sch1" },
};

function gateway(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCount.mockResolvedValue(0);
  mockFindMany.mockResolvedValue([pendingPayment]);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockFeeFind.mockResolvedValue({ amountPaid: 1000, finalFee: 5000 });
});

describe("reconcilePendingPayments", () => {
  it("credits the fee once when the gateway says CHARGED", async () => {
    gateway(200, { status: "CHARGED", amount: 500, id: "o1", txn_id: "t1" });
    const r = await reconcilePendingPayments();
    expect(r.succeeded).toBe(1);
    expect(mockFeeUpdate).toHaveBeenCalledWith({
      where: { studentId: "s1" },
      data: { amountPaid: 1500, remainingFee: 3500 },
    });
  });

  it("does not credit when verify/webhook already flipped the row", async () => {
    gateway(200, { status: "CHARGED", amount: 500 });
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const r = await reconcilePendingPayments();
    expect(r.succeeded).toBe(0);
    expect(mockFeeUpdate).not.toHaveBeenCalled();
  });

  it("refuses to credit on amount mismatch", async () => {
    gateway(200, { status: "CHARGED", amount: 999 });
    const r = await reconcilePendingPayments();
    expect(r.errors).toBe(1);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockFeeUpdate).not.toHaveBeenCalled();
  });

  it("marks terminal gateway failures as FAILED without touching the fee", async () => {
    gateway(200, { status: "AUTHORIZATION_FAILED" });
    const r = await reconcilePendingPayments();
    expect(r.failed).toBe(1);
    expect(mockFeeUpdate).not.toHaveBeenCalled();
  });

  it("treats a gateway 404 as failed", async () => {
    gateway(404, {});
    const r = await reconcilePendingPayments();
    expect(r.failed).toBe(1);
  });

  it("leaves in-flight orders pending", async () => {
    gateway(200, { status: "PENDING_VBV" });
    const r = await reconcilePendingPayments();
    expect(r.stillPending).toBe(1);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("counts a gateway 5xx as an error and changes nothing", async () => {
    gateway(502, {});
    const r = await reconcilePendingPayments();
    expect(r.errors).toBe(1);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("marks the event registration PAID for event payments", async () => {
    mockFindMany.mockResolvedValue([{ ...pendingPayment, eventRegistrationId: "er1" }]);
    gateway(200, { status: "CHARGED", amount: 500 });
    await reconcilePendingPayments();
    expect(mockRegUpdate).toHaveBeenCalledWith({
      where: { id: "er1" },
      data: { paymentStatus: "PAID", paymentId: "p1" },
    });
    expect(mockFeeUpdate).not.toHaveBeenCalled();
  });
});

describe("reconcilePendingPayments audit trail", () => {
  beforeEach(() => {
    mockAuditCreate.mockReset().mockResolvedValue({});
  });

  it("records who flipped a payment to SUCCESS (the job, not a person), in the same transaction", async () => {
    gateway(200, { status: "CHARGED", amount: 500, id: "o1", txn_id: "t1" });
    await reconcilePendingPayments();
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate.mock.calls[0][0].data).toMatchObject({
      schoolId: "sch1",
      paymentId: "p1",
      studentId: "s1",
      action: "STATUS",
      actorName: "Payment reconcile job",
      actorRole: "SYSTEM",
    });
    expect(mockAuditCreate.mock.calls[0][0].data.summary).toMatch(/PENDING -> SUCCESS/);
  });

  it("records a FAILED flip", async () => {
    gateway(200, { status: "AUTHORIZATION_FAILED" });
    await reconcilePendingPayments();
    expect(mockAuditCreate.mock.calls[0][0].data).toMatchObject({ action: "STATUS", paymentId: "p1" });
    expect(mockAuditCreate.mock.calls[0][0].data.summary).toMatch(/PENDING -> FAILED/);
  });

  it("writes nothing when another path already flipped the row, or on an amount mismatch", async () => {
    gateway(200, { status: "CHARGED", amount: 500 });
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await reconcilePendingPayments();
    expect(mockAuditCreate).not.toHaveBeenCalled();

    gateway(200, { status: "CHARGED", amount: 999 });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    await reconcilePendingPayments();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("does not credit the fee when the history row cannot be written (the transaction rolls back)", async () => {
    gateway(200, { status: "CHARGED", amount: 500, id: "o1" });
    mockAuditCreate.mockRejectedValue(new Error("audit down"));
    const r = await reconcilePendingPayments();
    expect(r.errors).toBe(1);
    expect(r.succeeded).toBe(0);
    expect(mockFeeUpdate).not.toHaveBeenCalled();
  });
});
