/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/transactions/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockPaymentFindMany = jest.fn();
const mockAllocationFindMany = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockQueryRawUnsafe = jest.fn();
const mockGetCached = jest.fn();
const mockSetCached = jest.fn();
const mockLoadFeeReportTransactions = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  getSchoolDashboardServerCached: (...args: unknown[]) => mockGetCached(...args),
  setSchoolDashboardServerCached: (...args: unknown[]) => mockSetCached(...args),
}));

jest.mock("@/lib/fees/loadDayFeeCollectionTransactions", () => ({
  loadFeeReportTransactions: (...args: unknown[]) => mockLoadFeeReportTransactions(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    payment: { findMany: (...args: unknown[]) => mockPaymentFindMany(...args) },
    paymentFeeAllocation: { findMany: (...args: unknown[]) => mockAllocationFindMany(...args) },
    extraFee: { findMany: (...args: unknown[]) => mockExtraFeeFindMany(...args) },
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
  },
}));

const request = (query = "") => new Request(`http://localhost/api/fees/transactions${query}`);

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const paymentRow = {
  id: "pay1",
  amount: 500,
  gateway: "HYPERPG",
  status: "SUCCESS",
  hyperpgStatus: "CHARGED",
  hyperpgStatusId: 21,
  hyperpgTxnId: "txn1",
  hyperpgRefunded: false,
  hyperpgAmountRefunded: 0,
  transactionId: "order1",
  createdAt: new Date("2024-01-01"),
  collectedByName: null,
  collectedByUserId: null,
  student: { id: "stu1", admissionNumber: "A1", user: { name: "Student One" }, class: { id: "c1", name: "5", section: "A" } },
};

describe("GET /api/fees/transactions", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockPaymentFindMany.mockReset().mockResolvedValue([]);
    mockAllocationFindMany.mockReset().mockResolvedValue([]);
    mockExtraFeeFindMany.mockReset().mockResolvedValue([]);
    mockQueryRawUnsafe.mockReset().mockResolvedValue([]);
    mockGetCached.mockReset().mockReturnValue(null);
    mockSetCached.mockReset();
    mockLoadFeeReportTransactions.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot view transactions", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns cached fee-report transactions when available and no refresh is requested", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockGetCached.mockReturnValue({ transactions: [{ id: "cached" }] });

    const res = await GET(request("?forFeeReport=1&from=2024-01-01&to=2024-01-31"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.transactions).toEqual([{ id: "cached" }]);
    expect(mockLoadFeeReportTransactions).not.toHaveBeenCalled();
  });

  it("bypasses the fee-report cache when refresh=1 is set", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockGetCached.mockReturnValue({ transactions: [{ id: "cached" }] });
    mockLoadFeeReportTransactions.mockResolvedValue([{ id: "fresh" }]);

    const res = await GET(request("?forFeeReport=1&from=2024-01-01&to=2024-01-31&refresh=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.transactions).toEqual([{ id: "fresh" }]);
    expect(mockLoadFeeReportTransactions).toHaveBeenCalledWith("s1", "2024-01-01", "2024-01-31", undefined);
  });

  it("loads a fresh fee report and caches it when nothing is cached", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockLoadFeeReportTransactions.mockResolvedValue([{ id: "fresh" }]);

    const res = await GET(request("?forFeeReport=1&from=2024-01-01"));
    expect(res.status).toBe(200);
    expect(mockLoadFeeReportTransactions).toHaveBeenCalledWith("s1", "2024-01-01", "2024-01-01", undefined);
    expect(mockSetCached).toHaveBeenCalled();
  });

  it("returns the school's SUCCESS/COMPLETED FEES payments with dominant fee-head and refund info", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindMany.mockResolvedValue([paymentRow]);
    mockAllocationFindMany.mockResolvedValue([
      {
        paymentId: "pay1",
        headType: "BASE_COMPONENT",
        componentIndex: 0,
        componentName: "Tuition",
        extraFeeId: null,
        allocatedAmount: 500,
      },
    ]);
    mockQueryRawUnsafe.mockResolvedValue([{ paymentId: "pay1", total: 100 }]);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.transactions).toHaveLength(1);
    const tx = json.transactions[0];
    expect(tx.id).toBe("pay1");
    expect(tx.feeTypeName).toBe("Tuition");
    expect(tx.feeTypeAmount).toBe(500);
    expect(tx.refunded).toBe(100);
    expect(tx.refundable).toBe(400);

    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          student: { schoolId: "s1" },
          status: { in: ["SUCCESS", "COMPLETED"] },
          purpose: "FEES",
        },
      })
    );
  });

  it("filters by studentId and does not cache student-scoped results", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindMany.mockResolvedValue([paymentRow]);

    const res = await GET(request("?studentId=stu1"));
    expect(res.status).toBe(200);
    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ student: { schoolId: "s1", id: "stu1" } }),
      })
    );
    expect(mockSetCached).not.toHaveBeenCalled();
  });

  it("defaults the fee type to 'Default' when there are no allocations for a payment", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentFindMany.mockResolvedValue([paymentRow]);
    mockAllocationFindMany.mockResolvedValue([]);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.transactions[0].feeTypeName).toBe("Default");
    expect(json.transactions[0].feeTypeAmount).toBe(500);
  });
});
