/**
 * @jest-environment node
 */
import { POST } from "@/app/api/payment/refund/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockPaymentFindFirst = jest.fn();
const mockQueryRawUnsafe = jest.fn();
const mockExecuteRawUnsafe = jest.fn();
const mockAllocationFindMany = jest.fn();
const mockAllocationCreateMany = jest.fn();
const mockStudentFeeUpdate = jest.fn();
const mockSchoolSettingsFindUnique = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

jest.mock("@/lib/db", () => {
  const dbMock: Record<string, unknown> = {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    payment: { findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args) },
    schoolSettings: { findUnique: (...args: unknown[]) => mockSchoolSettingsFindUnique(...args) },
    paymentFeeAllocation: {
      findMany: (...args: unknown[]) => mockAllocationFindMany(...args),
      createMany: (...args: unknown[]) => mockAllocationCreateMany(...args),
    },
    studentFee: { update: (...args: unknown[]) => mockStudentFeeUpdate(...args) },
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
    // Callback-form transaction (route wraps the refund flow in one tx + advisory lock):
    // run the callback against this same mock object, which exposes every method above.
    $transaction: (fn: (tx: unknown) => unknown) => fn(dbMock),
  };
  return { __esModule: true, default: dbMock };
});

const request = (body: unknown) =>
  new Request("http://localhost/api/payment/refund", {
    method: "POST",
    body: JSON.stringify(body),
  });

const adminSession = { user: { id: "admin1", role: "SCHOOLADMIN", schoolId: "s1" } };

const validBody = { paymentId: "pay1", amount: 200, reason: "duplicate" };

const offlinePayment = {
  id: "pay1",
  amount: 500,
  status: "SUCCESS",
  gateway: "CASH",
  transactionId: "OFFLN123",
  hyperpgOrderId: null,
  studentId: "stu1",
  eventRegistrationId: null,
  student: {
    schoolId: "s1",
    fee: { amountPaid: 500, remainingFee: 500, finalFee: 1000 },
    user: { id: "u1" },
  },
};

describe("POST /api/payment/refund", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockPaymentFindFirst.mockReset();
    mockQueryRawUnsafe.mockReset().mockResolvedValue([{ total: 0 }]);
    mockExecuteRawUnsafe.mockReset().mockResolvedValue(1);
    mockAllocationFindMany.mockReset().mockResolvedValue([]);
    mockAllocationCreateMany.mockReset().mockResolvedValue({ count: 0 });
    mockStudentFeeUpdate.mockReset().mockResolvedValue({});
    mockSchoolSettingsFindUnique.mockReset().mockResolvedValue(null);
    mockCreateNotification.mockReset().mockResolvedValue(undefined);
    global.fetch = jest.fn();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not an admin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is not a positive number", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(request({ ...validBody, amount: -5 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the payment does not exist", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the payment belongs to a different school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue({
      ...offlinePayment,
      student: { ...offlinePayment.student, schoolId: "other-school" },
    });
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 when the payment status is not SUCCESS", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue({ ...offlinePayment, status: "PENDING" });
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/only successful payments/i);
  });

  it("returns 400 for event/workshop payments", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue({ ...offlinePayment, eventRegistrationId: "reg1" });
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/cannot be refunded/i);
  });

  it("returns 400 when the refund amount exceeds what is refundable", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue(offlinePayment);
    mockQueryRawUnsafe.mockResolvedValue([{ total: 450 }]);
    const res = await POST(request({ ...validBody, amount: 100 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/exceeds max refundable/i);
  });

  it("returns 404 when the student has no fee record", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue({
      ...offlinePayment,
      student: { ...offlinePayment.student, fee: null },
    });
    const res = await POST(request(validBody));
    expect(res.status).toBe(404);
  });

  it("processes an offline refund and decrements the student fee", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue(offlinePayment);

    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.refund.amount).toBe(200);
    expect(json.refund.status).toBe("SUCCESS");
    expect(json.message).toMatch(/offline payment/i);

    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "Refund"'),
      expect.any(String),
      "pay1",
      200,
      "duplicate",
      "SUCCESS"
    );
    expect(mockStudentFeeUpdate).toHaveBeenCalledWith({
      where: { studentId: "stu1" },
      data: { amountPaid: 300, remainingFee: 700 },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when a HyperPG payment has no gateway order id", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue({
      ...offlinePayment,
      gateway: "HYPERPG",
      transactionId: null,
      hyperpgOrderId: null,
    });
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/no gateway order id/i);
  });

  it("returns 500 when the HyperPG gateway is not configured", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue({
      ...offlinePayment,
      gateway: "HYPERPG",
      transactionId: "order_1",
    });
    mockSchoolSettingsFindUnique.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(500);
  });

  it("returns 400 when the HyperPG refund call fails", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue({
      ...offlinePayment,
      gateway: "HYPERPG",
      transactionId: "order_1",
    });
    mockSchoolSettingsFindUnique.mockResolvedValue({
      hyperpgMerchantId: "m1",
      hyperpgApiKey: "k1",
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error_message: "insufficient balance" }),
    });
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe("insufficient balance");
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });

  it("processes a successful HyperPG refund and updates the student fee", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue({
      ...offlinePayment,
      gateway: "HYPERPG",
      transactionId: "order_1",
    });
    mockSchoolSettingsFindUnique.mockResolvedValue({
      hyperpgMerchantId: "m1",
      hyperpgApiKey: "k1",
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: "SUCCESS" }),
    });

    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.message).toMatch(/refund initiated with payment gateway/i);
    expect(mockStudentFeeUpdate).toHaveBeenCalledWith({
      where: { studentId: "stu1" },
      data: { amountPaid: 300, remainingFee: 700 },
    });
  });

  it("scales per-head allocations proportionally when the payment had fee-head allocations", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPaymentFindFirst.mockResolvedValue(offlinePayment);
    mockAllocationFindMany.mockResolvedValue([
      { headType: "TUITION", componentIndex: 0, componentName: "Tuition", extraFeeId: null, allocatedAmount: 400 },
      { headType: "TRANSPORT", componentIndex: 0, componentName: "Transport", extraFeeId: null, allocatedAmount: 100 },
    ]);

    const res = await POST(request({ ...validBody, amount: 200 }));
    expect(res.status).toBe(201);
    expect(mockAllocationCreateMany).toHaveBeenCalledTimes(1);
    const createdData = mockAllocationCreateMany.mock.calls[0][0].data as Array<{
      allocationType: string;
      allocatedAmount: number;
    }>;
    expect(createdData).toHaveLength(2);
    expect(createdData.every((a) => a.allocationType === "REFUND")).toBe(true);
    const total = createdData.reduce((s, a) => s + a.allocatedAmount, 0);
    expect(total).toBeCloseTo(200, 4);
  });
});
