/**
 * @jest-environment node
 */
import { POST } from "@/app/api/payment/create-order/route";

// Rate limiting has its own dedicated tests (lib/rateLimit.test.ts). Mocked here
// so this suite doesn't exercise real Upstash Redis (this repo's .env carries a
// live Upstash instance) and isn't affected by call-count state across test runs.
jest.mock("@/lib/rateLimit", () => ({
  rateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 19, resetInSeconds: 600 }),
  rateLimitKey: (...parts: string[]) => parts.join(":"),
}));

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockStudentFeeFindUnique = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockClassFeeStructureFindUnique = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockPaymentFeeAllocationFindMany = jest.fn();
const mockSchoolSettingsFindUnique = jest.fn();
const mockTransaction = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/studentTuitionFromStructure", () => ({
  structureMultiplierAfterDiscount: () => 1,
}));

jest.mock("@/lib/fees/extraFeeResidencyScope", () => ({
  extraFeeAppliesToStudent: () => true,
}));

jest.mock("@/lib/students/studentRte", () => ({
  isStudentRte: () => false,
  isTuitionNamedExtraFee: () => false,
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    studentFee: { findUnique: (...args: unknown[]) => mockStudentFeeFindUnique(...args) },
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    classFeeStructure: { findUnique: (...args: unknown[]) => mockClassFeeStructureFindUnique(...args) },
    extraFee: { findMany: (...args: unknown[]) => mockExtraFeeFindMany(...args) },
    paymentFeeAllocation: { findMany: (...args: unknown[]) => mockPaymentFeeAllocationFindMany(...args) },
    schoolSettings: { findUnique: (...args: unknown[]) => mockSchoolSettingsFindUnique(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const request = (body: unknown) =>
  new Request("http://localhost/api/payment/create-order", {
    method: "POST",
    body: JSON.stringify(body),
  });

const studentSession = {
  user: { id: "u1", role: "STUDENT", studentId: "stu1", email: "student@example.com" },
};

const baseStudent = {
  id: "stu1",
  schoolId: "s1",
  classId: "c1",
  residencyType: "Day Scholar",
  class: { id: "c1", section: "A" },
  phoneNo: "9876543210",
  fatherName: "Father Name",
  user: { name: "Student Name", email: "student@example.com" },
};

describe("POST /api/payment/create-order", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFeeFindUnique.mockReset();
    mockStudentFindUnique.mockReset().mockResolvedValue(baseStudent);
    mockClassFeeStructureFindUnique.mockReset().mockResolvedValue(null);
    mockExtraFeeFindMany.mockReset().mockResolvedValue([]);
    mockPaymentFeeAllocationFindMany.mockReset().mockResolvedValue([]);
    mockSchoolSettingsFindUnique.mockReset().mockResolvedValue({
      hyperpgMerchantId: "m1",
      hyperpgApiKey: "k1",
    });
    mockTransaction.mockReset();
    global.fetch = jest.fn();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request({ amount: 100 }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-student sessions", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await POST(request({ amount: 100 }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when amount is invalid", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    const res = await POST(request({ amount: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount exceeds the remaining fee", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFeeFindUnique.mockResolvedValue({ remainingFee: 50 });
    const res = await POST(request({ amount: 100 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/cannot exceed remaining fee/i);
  });

  it("returns 404 when the student is not found", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFeeFindUnique.mockResolvedValue({ remainingFee: 1000 });
    mockStudentFindUnique.mockResolvedValue(null);
    const res = await POST(request({ amount: 100 }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the student has no fee record for a fee payment", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFeeFindUnique
      .mockResolvedValueOnce({ remainingFee: 1000 })
      .mockResolvedValueOnce(null);
    mockStudentFindUnique.mockResolvedValue(baseStudent);
    const res = await POST(
      request({ amount: 100, fee_selection: [{ headType: "BASE_COMPONENT", componentIndex: 0 }] })
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when no fee heads are selected", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFeeFindUnique
      .mockResolvedValueOnce({ remainingFee: 1000 })
      .mockResolvedValueOnce({ amountPaid: 0, finalFee: 1000, totalFee: 1000, remainingFee: 1000, discountPercent: 0 });
    mockStudentFindUnique.mockResolvedValue(baseStudent);
    const res = await POST(request({ amount: 100, fee_selection: [] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/select at least one fee type/i);
  });

  it("returns 500 when the HyperPG API key is not configured", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockSchoolSettingsFindUnique.mockResolvedValue(null);
    const res = await POST(
      request({ amount: 100, event_registration_id: "reg1" })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/not configured/i);
  });

  it("returns 500 when the gateway session call fails", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error_message: "bad credentials" }),
    });
    const res = await POST(request({ amount: 100, event_registration_id: "reg1" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Payment gateway error");
    expect(json.details).toMatch(/bad credentials/i);
  });

  it("returns 500 when the gateway response has no payment URL", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: "hp1", status: "NEW" }),
    });
    const res = await POST(request({ amount: 100, event_registration_id: "reg1" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/did not return payment url/i);
  });

  it("creates a pending payment for an event/workshop order, skipping fee allocation logic", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: "hp1",
          status: "NEW",
          payment_links: { web: "https://pay.example.com/hp1" },
        }),
    });
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        payment: {
          create: jest.fn().mockResolvedValue({ id: "pay1" }),
        },
        paymentFeeAllocation: { createMany: jest.fn() },
      };
      return cb(tx);
    });

    const res = await POST(request({ amount: 250, event_registration_id: "reg1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gateway).toBe("HYPERPG");
    expect(json.payment_url).toBe("https://pay.example.com/hp1");
    expect(json.amount).toBe(250);
    // Fee-record lookups should never run for an event/workshop payment.
    expect(mockStudentFeeFindUnique).not.toHaveBeenCalled();
  });

  it("creates a pending payment with proportional per-head allocations for a fee payment", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFeeFindUnique
      .mockResolvedValueOnce({ remainingFee: 1000 })
      .mockResolvedValueOnce({ amountPaid: 0, finalFee: 1000, totalFee: 1000, remainingFee: 1000, discountPercent: 0 });
    mockStudentFindUnique.mockResolvedValue(baseStudent);
    mockClassFeeStructureFindUnique.mockResolvedValue({
      components: [{ name: "Tuition", amount: 1000 }],
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: "hp1",
          status: "NEW",
          payment_links: { web: "https://pay.example.com/hp1" },
        }),
    });

    let createdAllocations: unknown[] = [];
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        payment: {
          create: jest.fn().mockResolvedValue({ id: "pay1" }),
        },
        paymentFeeAllocation: {
          createMany: jest.fn((args: { data: unknown[] }) => {
            createdAllocations = args.data;
          }),
        },
      };
      return cb(tx);
    });

    const res = await POST(
      request({
        amount: 300,
        fee_selection: [{ headType: "BASE_COMPONENT", componentIndex: 0 }],
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.payment_url).toBe("https://pay.example.com/hp1");
    expect(createdAllocations).toEqual([
      expect.objectContaining({
        headType: "BASE_COMPONENT",
        componentIndex: 0,
        allocatedAmount: 300,
      }),
    ]);
  });
});
