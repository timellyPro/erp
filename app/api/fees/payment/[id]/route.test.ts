/**
 * @jest-environment node
 */
import { PATCH, DELETE } from "@/app/api/fees/payment/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockPaymentFindFirst = jest.fn();
const mockPaymentFindUnique = jest.fn();
const mockPaymentUpdate = jest.fn();
const mockParentSubscriptionCount = jest.fn();
const mockRefundCount = jest.fn();
const mockTransaction = jest.fn();
const mockInvalidateStudentFeeReadCaches = jest.fn();
const mockDeleteFastFeePayment = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...args: unknown[]) => mockInvalidateStudentFeeReadCaches(...args),
}));

jest.mock("@/lib/fees/deleteFastFeePayment", () => ({
  deleteFastFeePayment: (...args: unknown[]) => mockDeleteFastFeePayment(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    payment: {
      findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args),
      findUnique: (...args: unknown[]) => mockPaymentFindUnique(...args),
      update: (...args: unknown[]) => mockPaymentUpdate(...args),
    },
    parentSubscription: { count: (...args: unknown[]) => mockParentSubscriptionCount(...args) },
    refund: { count: (...args: unknown[]) => mockRefundCount(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const ctx = { params: Promise.resolve({ id: "pay1" }) };

const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/fees/payment/pay1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
const deleteRequest = (query = "") =>
  new Request(`http://localhost/api/fees/payment/pay1${query}`, { method: "DELETE" });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const feePayment = {
  id: "pay1",
  studentId: "stu1",
  amount: 500,
  status: "SUCCESS",
  purpose: "FEES",
  eventRegistrationId: null,
  student: {
    id: "stu1",
    fee: { amountPaid: 500, finalFee: 1000, remainingFee: 500 },
  },
};

describe("PATCH /api/fees/payment/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockPaymentFindFirst.mockReset();
    mockPaymentFindUnique.mockReset();
    mockPaymentUpdate.mockReset();
    mockParentSubscriptionCount.mockReset().mockResolvedValue(0);
    mockRefundCount.mockReset().mockResolvedValue(0);
    mockTransaction.mockReset();
    mockInvalidateStudentFeeReadCaches.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ amount: 600 }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage payments", async () => {
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

  it("returns 404 when the payment is not found for the school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ amount: 600 }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-fee (event) payment", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue({ ...feePayment, eventRegistrationId: "reg1" });
    const res = await PATCH(patchRequest({ amount: 600 }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when no editable field is provided", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue(feePayment);
    const res = await PATCH(patchRequest({}), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid createdAt", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue(feePayment);
    const res = await PATCH(patchRequest({ createdAt: "not-a-date" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the payment is linked to a subscription", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue(feePayment);
    mockParentSubscriptionCount.mockResolvedValue(1);
    const res = await PATCH(patchRequest({ amount: 600 }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/subscription/i);
  });

  it("returns 400 when the payment has recorded refunds", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue(feePayment);
    mockRefundCount.mockResolvedValue(1);
    const res = await PATCH(patchRequest({ amount: 600 }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/refunds recorded/i);
  });

  it("returns 400 when changing the amount of a non-successful payment", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue({ ...feePayment, status: "PENDING" });
    const res = await PATCH(patchRequest({ amount: 600 }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/only be changed for successful/i);
  });

  it("returns 400 when the student has no fee record", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue({ ...feePayment, student: { id: "stu1", fee: null } });
    const res = await PATCH(patchRequest({ amount: 600 }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-positive amount", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue(feePayment);
    const res = await PATCH(patchRequest({ amount: -10 }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the amount change would make total paid negative", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue({
      ...feePayment,
      amount: 500,
      student: { id: "stu1", fee: { amountPaid: 100, finalFee: 1000 } },
    });
    const res = await PATCH(patchRequest({ amount: 1 }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/negative/i);
  });

  it("updates the amount, scales allocations, adjusts the student fee, and invalidates caches", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue(feePayment);
    mockPaymentFindUnique.mockResolvedValue({ id: "pay1", amount: 700 });

    const txMock = {
      paymentFeeAllocation: {
        findMany: jest.fn().mockResolvedValue([
          { id: "alloc1", allocatedAmount: 500, headType: "BASE_COMPONENT", componentIndex: 0, componentName: "Tuition", extraFeeId: null },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: { update: jest.fn().mockResolvedValue({}) },
      studentFee: { update: jest.fn().mockResolvedValue({}) },
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txMock));

    const res = await PATCH(patchRequest({ amount: 700 }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("Payment updated");

    expect(txMock.paymentFeeAllocation.update).toHaveBeenCalledWith({
      where: { id: "alloc1" },
      data: { allocatedAmount: 700 },
    });
    expect(txMock.payment.update).toHaveBeenCalledWith({
      where: { id: "pay1" },
      data: { amount: 700 },
    });
    expect(txMock.studentFee.update).toHaveBeenCalledWith({
      where: { studentId: "stu1" },
      data: { amountPaid: 700, remainingFee: 300 },
    });
    expect(mockInvalidateStudentFeeReadCaches).toHaveBeenCalledWith({ studentId: "stu1", schoolId: "s1" });
  });

  it("updates metadata only (transactionId/gateway) without touching the student fee", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindFirst.mockResolvedValue(feePayment);
    mockPaymentFindUnique.mockResolvedValue({ id: "pay1", transactionId: "NEWTXN" });

    const res = await PATCH(patchRequest({ transactionId: "NEWTXN", gateway: "cash" }), ctx);
    expect(res.status).toBe(200);
    expect(mockPaymentUpdate).toHaveBeenCalledWith({
      where: { id: "pay1" },
      data: { transactionId: "NEWTXN", gateway: "OFFLINE_CASH" },
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInvalidateStudentFeeReadCaches).toHaveBeenCalledWith({ studentId: "stu1", schoolId: "s1" });
  });
});

describe("DELETE /api/fees/payment/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockDeleteFastFeePayment.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage payments", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(400);
  });

  it("deletes the payment via the shared helper and returns its result", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockDeleteFastFeePayment.mockResolvedValue({ reversedAmount: 500 });
    const res = await DELETE(deleteRequest("?studentId=stu1"), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, reversedAmount: 500 });
    expect(mockDeleteFastFeePayment).toHaveBeenCalledWith("pay1", "s1", "stu1");
  });

  it("maps a 'not found' helper error to 404", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockDeleteFastFeePayment.mockRejectedValue(new Error("Payment not found"));
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("maps a 'blocked' helper error to 400", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockDeleteFastFeePayment.mockRejectedValue(new Error("Delete blocked: refunds exist"));
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(400);
  });

  it("maps an unrelated helper error to 500", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockDeleteFastFeePayment.mockRejectedValue(new Error("DB exploded"));
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(500);
  });
});
