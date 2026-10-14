/**
 * @jest-environment node
 */
import { POST } from "@/app/api/payment/verify/route";

// Rate limiting has its own dedicated tests (lib/rateLimit.test.ts). Mocked here
// so this suite doesn't exercise real Upstash Redis (this repo's .env carries a
// live Upstash instance) and isn't affected by call-count state across test runs.
jest.mock("@/lib/rateLimit", () => ({
  rateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 29, resetInSeconds: 600 }),
  rateLimitKey: (...parts: string[]) => parts.join(":"),
}));

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockSchoolSettingsFindUnique = jest.fn();
const mockPaymentFindFirst = jest.fn();
const mockPaymentCreate = jest.fn();
const mockStudentFeeFindUnique = jest.fn();
const mockStudentFeeUpdate = jest.fn();
const mockTransaction = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    schoolSettings: { findUnique: (...args: unknown[]) => mockSchoolSettingsFindUnique(...args) },
    payment: {
      findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args),
      create: (...args: unknown[]) => mockPaymentCreate(...args),
    },
    studentFee: {
      findUnique: (...args: unknown[]) => mockStudentFeeFindUnique(...args),
      update: (...args: unknown[]) => mockStudentFeeUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const request = (body: unknown) =>
  new Request("http://localhost/api/payment/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });

const studentSession = {
  user: { id: "u1", role: "STUDENT", studentId: "stu1" },
};

const validBody = {
  gateway: "HYPERPG",
  order_id: "order_123",
  amount: 500,
};

describe("POST /api/payment/verify", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindUnique.mockReset();
    mockSchoolSettingsFindUnique.mockReset();
    mockPaymentFindFirst.mockReset();
    mockPaymentCreate.mockReset();
    mockStudentFeeFindUnique.mockReset();
    mockStudentFeeUpdate.mockReset();
    mockTransaction.mockReset();
    mockCreateNotification.mockReset().mockResolvedValue(undefined);
    global.fetch = jest.fn();
    // HYPERPG_MERCHANT_ID/HYPERPG_API_KEY are read once at module load and are
    // unset in the test env, so gateway config must come from schoolSettings
    // in every test that expects the gateway to be configured.
    mockSchoolSettingsFindUnique.mockResolvedValue({
      hyperpgMerchantId: "school-merchant",
      hyperpgApiKey: "school-key",
    });
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-student sessions", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 when amount is invalid", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    const res = await POST(request({ ...validBody, amount: "not-a-number" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/valid amount/i);
  });

  it("returns 400 for a non-HYPERPG gateway", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    const res = await POST(request({ ...validBody, gateway: "RAZORPAY" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/only hyperpg/i);
  });

  it("returns 400 when order_id is missing", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    const res = await POST(request({ ...validBody, order_id: undefined }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/order_id/i);
  });

  it("returns 404 when the student is not found", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 500 when the gateway is not configured for the school", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue({ schoolId: "s1" });
    mockSchoolSettingsFindUnique.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toMatch(/not configured/i);
  });

  it("returns 502 when the HyperPG status call fails", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue({ schoolId: "s1" });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "gateway error",
    });
    const res = await POST(request(validBody));
    expect(res.status).toBe(502);
  });

  it("returns 400 when the order is not yet charged", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue({ schoolId: "s1" });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "NEW" }),
    });
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/not completed yet/i);
  });

  it("returns 400 when the charged amount does not match the order amount", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue({ schoolId: "s1" });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "CHARGED", amount: 999 }),
    });
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/amount mismatch/i);
  });

  it("returns 404 when no pre-created payment exists and the student has no fee record", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue({ schoolId: "s1" });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "CHARGED", amount: 500, id: "hp1" }),
    });
    mockPaymentFindFirst.mockResolvedValue(null);
    mockStudentFeeFindUnique.mockResolvedValue(null);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        studentFee: {
          findUnique: (...args: unknown[]) => mockStudentFeeFindUnique(...args),
          update: (...args: unknown[]) => mockStudentFeeUpdate(...args),
        },
        payment: { create: (...args: unknown[]) => mockPaymentCreate(...args) },
      })
    );
    const res = await POST(request(validBody));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toMatch(/fee details not found/i);
  });

  it("creates a new payment and updates the fee (legacy flow) when no pre-created payment exists", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue({ schoolId: "s1", userId: "u1" });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "CHARGED", amount: 500, id: "hp1", txn_id: "txn1" }),
    });
    mockPaymentFindFirst.mockResolvedValue(null);
    mockStudentFeeFindUnique
      .mockResolvedValueOnce({ amountPaid: 0, finalFee: 1000 })
      .mockResolvedValueOnce(null);
    mockPaymentCreate.mockResolvedValue({ id: "pay1", amount: 500 });
    mockStudentFeeUpdate.mockResolvedValue({ amountPaid: 500, remainingFee: 500 });
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        studentFee: {
          findUnique: (...args: unknown[]) => mockStudentFeeFindUnique(...args),
          update: (...args: unknown[]) => mockStudentFeeUpdate(...args),
        },
        payment: { create: (...args: unknown[]) => mockPaymentCreate(...args) },
      })
    );

    const res = await POST(request(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.payment.id).toBe("pay1");
    expect(json.fee.remainingFee).toBe(500);
    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "stu1",
          amount: 500,
          gateway: "HYPERPG",
          transactionId: "order_123",
          status: "SUCCESS",
        }),
      })
    );
    expect(mockStudentFeeUpdate).toHaveBeenCalledWith({
      where: { studentId: "stu1" },
      data: { amountPaid: 500, remainingFee: 500 },
    });
  });

  it("transitions an existing pre-created payment to SUCCESS and updates the student fee", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique
      .mockResolvedValueOnce({ schoolId: "s1" })
      .mockResolvedValueOnce({ userId: "u1" });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "CHARGED", amount: 500, id: "hp1", txn_id: "txn1" }),
    });
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay1",
      studentId: "stu1",
      eventRegistrationId: null,
      hyperpgOrderId: null,
      hyperpgTxnId: null,
    });

    const txMock = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          status: "PENDING",
          amount: 500,
          studentId: "stu1",
          eventRegistrationId: null,
        }),
        update: jest.fn().mockResolvedValue({ id: "pay1", status: "SUCCESS", amount: 500 }),
      },
      studentFee: {
        findUnique: jest.fn().mockResolvedValue({ amountPaid: 0, finalFee: 1000 }),
        update: jest.fn().mockResolvedValue({ amountPaid: 500, remainingFee: 500 }),
      },
      eventRegistration: { update: jest.fn() },
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txMock));
    mockStudentFeeFindUnique.mockResolvedValue({ amountPaid: 500, remainingFee: 500 });

    const res = await POST(request(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.payment.status).toBe("SUCCESS");
    expect(txMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pay1" },
        data: expect.objectContaining({ status: "SUCCESS" }),
      })
    );
    expect(txMock.studentFee.update).toHaveBeenCalledWith({
      where: { studentId: "stu1" },
      data: { amountPaid: 500, remainingFee: 500 },
    });
    expect(txMock.eventRegistration.update).not.toHaveBeenCalled();
  });

  it("marks the linked event registration as PAID instead of touching studentFee", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue({ schoolId: "s1" });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "CHARGED", amount: 500, id: "hp1" }),
    });
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay1",
      studentId: "stu1",
      eventRegistrationId: "reg1",
    });

    const txMock = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          status: "PENDING",
          amount: 500,
          studentId: "stu1",
          eventRegistrationId: "reg1",
        }),
        update: jest.fn().mockResolvedValue({ id: "pay1", status: "SUCCESS", amount: 500 }),
      },
      studentFee: { findUnique: jest.fn(), update: jest.fn() },
      eventRegistration: { update: jest.fn().mockResolvedValue({}) },
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txMock));

    const res = await POST(request(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.eventRegistration.paymentStatus).toBe("PAID");
    expect(txMock.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: "reg1" },
      data: { paymentStatus: "PAID", paymentId: "pay1" },
    });
    expect(txMock.studentFee.update).not.toHaveBeenCalled();
  });
});
