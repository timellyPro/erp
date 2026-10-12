/**
 * @jest-environment node
 */

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
export {};

const mockGetServerSession = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockPaymentCreate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    payment: { create: (...args: unknown[]) => mockPaymentCreate(...args) },
  },
}));

// HYPERPG_MERCHANT_ID/HYPERPG_API_KEY are read once at module load with no DB
// fallback, so this module must be required fresh after the env is set.
process.env.HYPERPG_MERCHANT_ID = "merchant1";
process.env.HYPERPG_API_KEY = "key1";
let POST: typeof import("@/app/api/parent/subscription/create-order/route").POST;
beforeAll(() => {
  jest.resetModules();
  POST = require("@/app/api/parent/subscription/create-order/route").POST;
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/parent/subscription/create-order", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const studentSession = { user: { id: "u1", role: "STUDENT", studentId: "st1", email: "p@x.com" } };
const studentRow = {
  id: "st1",
  schoolId: "s1",
  phoneNo: "9876543210",
  fatherName: "Father",
  user: { name: "Parent Name", email: "p@x.com" },
  school: { billingMode: "PARENT_SUBSCRIPTION", parentSubscriptionAmount: 200 },
};

describe("POST /api/parent/subscription/create-order", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindUnique.mockReset();
    mockPaymentCreate.mockReset();
    global.fetch = jest.fn();
  });

  it("returns 401 when the session isn't a student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the student or school isn't found", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(404);
  });

  it("returns 400 when the school is already on paid mode", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue({ ...studentRow, school: { billingMode: "SCHOOL_PAID" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the subscription amount is invalid", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue({
      ...studentRow,
      school: { billingMode: "PARENT_SUBSCRIPTION", parentSubscriptionAmount: 0 },
    });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 500 when the gateway session call fails", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue(studentRow);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error_message: "bad credentials" }),
    });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
  });

  it("creates a pending subscription payment and returns the payment URL", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValue(studentRow);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ id: "hp1", payment_links: { web: "https://pay.example.com/hp1" } }),
    });
    mockPaymentCreate.mockResolvedValue({ id: "pay1" });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.payment_url).toBe("https://pay.example.com/hp1");
    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ purpose: "PARENT_SUBSCRIPTION" }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
  });
});
