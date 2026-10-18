/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/receipt-lookup/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockPaymentFindMany = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockAuditFindMany = jest.fn();
const mockStudentFindMany = jest.fn();

jest.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock("@/lib/auth/authOptions", () => ({}));
jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...a: unknown[]) => mockResolveFeesSchoolId(...a),
}));
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    payment: { findMany: (...a: unknown[]) => mockPaymentFindMany(...a) },
    extraFee: { findMany: (...a: unknown[]) => mockExtraFeeFindMany(...a) },
    paymentAuditLog: { findMany: (...a: unknown[]) => mockAuditFindMany(...a) },
    student: { findMany: (...a: unknown[]) => mockStudentFindMany(...a) },
  },
}));

const admin = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };
const get = (qs: string) => GET(new Request(`http://localhost/api/fees/receipt-lookup?${qs}`));

const payment = {
  id: "cmpay1",
  studentId: "stu1",
  amount: 5000,
  status: "PENDING",
  purpose: "FEES",
  gateway: "OFFLINE_UPI",
  transactionId: "UTR-123",
  hyperpgOrderId: null,
  hyperpgStatus: null,
  collectedByName: "Front desk",
  createdAt: new Date("2026-10-07T12:00:00.000Z"),
  student: {
    id: "stu1",
    admissionNumber: "ADM/1",
    user: { name: "Asha K" },
    class: { name: "CLASS 8", section: "A" },
  },
  feeAllocations: [
    { headType: "BASE_COMPONENT", componentName: "Tuition Fee", extraFeeId: null, allocationType: "PAYMENT", allocatedAmount: 4000 },
    { headType: "EXTRA_FEE", componentName: null, extraFeeId: "ex1", allocationType: "PAYMENT", allocatedAmount: 1000 },
  ],
  refunds: [{ amount: 200 }, { amount: 50 }],
};

describe("GET /api/fees/receipt-lookup", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset().mockResolvedValue(admin);
    mockResolveFeesSchoolId.mockReset().mockResolvedValue("s1");
    mockPaymentFindMany.mockReset().mockResolvedValue([]);
    mockExtraFeeFindMany.mockReset().mockResolvedValue([]);
    mockAuditFindMany.mockReset().mockResolvedValue([]);
    mockStudentFindMany.mockReset().mockResolvedValue([]);
  });

  it("returns 401 without a session and 403 for non-admins (history shows staff names)", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await get("q=abc")).status).toBe(401);
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "s1" } });
    expect((await get("q=abc")).status).toBe(403);
    expect(mockPaymentFindMany).not.toHaveBeenCalled();
  });

  it("requires something to search for, and validates amount and dates", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("q=a")).status).toBe(400);
    expect((await get("amount=-5")).status).toBe(400);
    expect((await get("amount=abc")).status).toBe(400);
    expect((await get("from=07-10-2026")).status).toBe(400);
    expect((await get("q=abc&to=nope")).status).toBe(400);
    expect(mockPaymentFindMany).not.toHaveBeenCalled();
  });

  it("searches reference, id, name and admission number within the school, without hiding any status", async () => {
    await get("q=UTR-123");
    const where = mockPaymentFindMany.mock.calls[0][0].where;
    // school scope is always the first condition
    expect(where.AND[0]).toEqual({ student: { schoolId: "s1" } });
    const or = where.AND[1].OR;
    expect(or).toEqual(
      expect.arrayContaining([
        { transactionId: { contains: "UTR-123", mode: "insensitive" } },
        { id: { startsWith: "UTR-123" } },
        { student: { admissionNumber: { contains: "UTR-123", mode: "insensitive" } } },
      ])
    );
    // unlike the Transactions list, no status/purpose filter: PENDING and FAILED payments must show
    expect(JSON.stringify(where)).not.toContain('"status"');
    expect(JSON.stringify(where)).not.toContain('"purpose"');
  });

  it("matches the amount to the nearest paisa and the date range by UTC day", async () => {
    await get("amount=5000&from=2026-10-07&to=2026-10-07");
    const and = mockPaymentFindMany.mock.calls[0][0].where.AND;
    expect(and).toContainEqual({ amount: { gte: 4999.995, lte: 5000.005 } });
    expect(and).toContainEqual({
      createdAt: { gte: new Date("2026-10-07T00:00:00.000Z"), lt: new Date("2026-10-08T00:00:00.000Z") },
    });
  });

  it("clamps the limit", async () => {
    await get("q=abc&limit=9999");
    expect(mockPaymentFindMany.mock.calls[0][0].take).toBe(50);
    await get("q=abc&limit=0");
    expect(mockPaymentFindMany.mock.calls[1][0].take).toBe(25);
  });

  it("returns the payment with heads, refunds, class label and its audit history", async () => {
    mockPaymentFindMany.mockResolvedValue([payment]);
    mockExtraFeeFindMany.mockResolvedValue([{ id: "ex1", name: "Bus Fee" }]);
    mockAuditFindMany.mockResolvedValue([
      { id: "a1", paymentId: "cmpay1", action: "CREATE", actorName: "Clerk", actorRole: "TEACHER", summary: "Recorded payment of 5000", createdAt: new Date("2026-10-07T12:01:00Z") },
      { id: "a2", paymentId: "cmpay1", action: "UPDATE", actorName: "Asha Admin", actorRole: "SCHOOLADMIN", summary: "Amount 5500 -> 5000", createdAt: new Date("2026-10-08T09:00:00Z") },
    ]);

    const json = await (await get("q=UTR-123")).json();
    expect(json.payments).toHaveLength(1);
    const p = json.payments[0];
    expect(p).toMatchObject({
      id: "cmpay1",
      status: "PENDING",
      refundedTotal: 250,
      student: { name: "Asha K", admissionNumber: "ADM/1", class: "CLASS 8-A" },
    });
    expect(p.heads).toEqual([
      { name: "Tuition Fee", amount: 4000, type: "PAYMENT" },
      { name: "Bus Fee", amount: 1000, type: "PAYMENT" },
    ]);
    expect(p.history.map((h: { action: string }) => h.action)).toEqual(["CREATE", "UPDATE"]);
    expect(p.history[1]).toMatchObject({ actorName: "Asha Admin", summary: "Amount 5500 -> 5000" });
    // the history query is school-scoped
    expect(mockAuditFindMany.mock.calls[0][0].where).toMatchObject({ schoolId: "s1", paymentId: { in: ["cmpay1"] } });
  });

  it("finds a DELETED payment through the audit log, with who deleted it and its heads", async () => {
    mockAuditFindMany.mockResolvedValue([
      {
        id: "a9",
        paymentId: "cmgone",
        studentId: "stu1",
        actorName: "Asha Admin",
        actorRole: "SCHOOLADMIN",
        summary: "Deleted payment of 7000 (ref RCPT-77)",
        createdAt: new Date("2026-10-09T10:00:00Z"),
        before: {
          amount: 7000,
          transactionId: "RCPT-77",
          createdAt: "2026-10-01T12:00:00.000Z",
          allocations: [{ name: "Hostel Fee (1st Installment)", amount: 7000 }],
        },
      },
    ]);
    mockStudentFindMany.mockResolvedValue([{ id: "stu1", admissionNumber: "ADM/1", user: { name: "Asha K" } }]);

    const json = await (await get("q=RCPT-77&amount=7000")).json();

    const deleteQuery = mockAuditFindMany.mock.calls.find((c) => c[0].where.action === "DELETE")![0];
    expect(deleteQuery.where.schoolId).toBe("s1");
    expect(deleteQuery.where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { summary: { contains: "RCPT-77", mode: "insensitive" } },
        { before: { path: ["amount"], equals: 7000 } },
      ])
    );
    expect(json.payments).toEqual([]);
    expect(json.deleted).toHaveLength(1);
    expect(json.deleted[0]).toMatchObject({
      paymentId: "cmgone",
      deletedBy: "Asha Admin",
      amount: 7000,
      transactionId: "RCPT-77",
      heads: [{ name: "Hostel Fee (1st Installment)", amount: 7000 }],
      student: { name: "Asha K", admissionNumber: "ADM/1" },
    });
  });

  it("does not search deletions when only a date range was given", async () => {
    await get("from=2026-10-01&to=2026-10-31");
    expect(mockAuditFindMany.mock.calls.some((c) => c[0].where.action === "DELETE")).toBe(false);
  });

  it("flags a possibly cut-off result", async () => {
    mockPaymentFindMany.mockResolvedValue(Array.from({ length: 3 }, (_, i) => ({ ...payment, id: `p${i}` })));
    const json = await (await get("q=abc&limit=3")).json();
    expect(json.truncated).toBe(true);
  });
});
