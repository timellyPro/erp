/**
 * @jest-environment node
 */
import { POST } from "@/app/api/fees/discount-approvals/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockQueryRaw = jest.fn();
const mockTransaction = jest.fn();
const mockInvalidateStudentFeeReadCaches = jest.fn();
const mockInvalidateDiscountApprovalsListCache = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...args: unknown[]) => mockInvalidateStudentFeeReadCaches(...args),
}));

jest.mock("@/lib/fees/discountApprovalsListCache", () => ({
  invalidateDiscountApprovalsListCache: (...args: unknown[]) => mockInvalidateDiscountApprovalsListCache(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const request = (body: unknown) =>
  new Request("http://localhost/api/fees/discount-approvals/app1", {
    method: "POST",
    body: JSON.stringify(body),
  });

const ctx = { params: { id: "app1" } };

const chairmanSession = { user: { id: "chair1", role: "CHAIRMAN", schoolId: "s1" } };

const pendingApproval = {
  id: "app1",
  schoolId: "s1",
  studentId: "stu1",
  studentFeeId: "sf1",
  status: "PENDING",
  totalFee: 1000,
  discountPercent: 10,
  discountFixedAmount: null,
  finalFee: 900,
  discountFeeHeadKey: "TUITION",
  discountFeeHeadLabel: "Tuition",
  discountRemarks: "Sibling discount",
  amountPaid: 200,
  studentTotalFee: 1000,
};

function txMockFor(approvedRows: unknown[] = []) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(approvedRows),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  return tx;
}

describe("POST /api/fees/discount-approvals/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockQueryRaw.mockReset();
    mockTransaction.mockReset();
    mockInvalidateStudentFeeReadCaches.mockReset().mockResolvedValue(undefined);
    mockInvalidateDiscountApprovalsListCache.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request({ action: "APPROVE" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot review discounts", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await POST(request({ action: "APPROVE" }), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid action", async () => {
    mockGetServerSession.mockResolvedValue(chairmanSession);
    const res = await POST(request({ action: "MAYBE" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the approval does not exist", async () => {
    mockGetServerSession.mockResolvedValue(chairmanSession);
    mockQueryRaw.mockResolvedValue([]);
    const res = await POST(request({ action: "APPROVE" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when a school-scoped chairman reviews another school's approval", async () => {
    mockGetServerSession.mockResolvedValue(chairmanSession);
    mockQueryRaw.mockResolvedValue([{ ...pendingApproval, schoolId: "other-school" }]);
    const res = await POST(request({ action: "APPROVE" }), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when approving/rejecting a request that is already reviewed", async () => {
    mockGetServerSession.mockResolvedValue(chairmanSession);
    mockQueryRaw.mockResolvedValue([{ ...pendingApproval, status: "APPROVED" }]);
    const res = await POST(request({ action: "APPROVE" }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/already reviewed/i);
  });

  it("returns 400 when reverting a request that is not currently approved", async () => {
    mockGetServerSession.mockResolvedValue(chairmanSession);
    mockQueryRaw.mockResolvedValue([{ ...pendingApproval, status: "PENDING" }]);
    const res = await POST(request({ action: "REVERT" }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/only approved discounts/i);
  });

  it("rejects a pending request without recalculating the student fee", async () => {
    mockGetServerSession.mockResolvedValue(chairmanSession);
    mockQueryRaw.mockResolvedValue([pendingApproval]);
    const tx = txMockFor();
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const res = await POST(request({ action: "REJECT", reviewRemarks: "Not eligible" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/rejected/i);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(mockInvalidateStudentFeeReadCaches).toHaveBeenCalledWith({ studentId: "stu1", schoolId: "s1" });
    expect(mockInvalidateDiscountApprovalsListCache).toHaveBeenCalledWith("s1");
  });

  it("approves a pending request and recalculates the student fee from all approved discounts", async () => {
    mockGetServerSession.mockResolvedValue(chairmanSession);
    mockQueryRaw.mockResolvedValue([pendingApproval]);
    const tx = txMockFor([
      {
        discountPercent: 10,
        discountFixedAmount: null,
        discountFeeHeadKey: "TUITION",
        discountFeeHeadLabel: "Tuition",
        discountRemarks: "Sibling discount",
      },
    ]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const res = await POST(request({ action: "APPROVE" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/approved and applied/i);

    // 1 update for the approval status + 1 update for the recalculated StudentFee.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("reverts an approved request, marks it rejected, and restores the fee", async () => {
    mockGetServerSession.mockResolvedValue(chairmanSession);
    mockQueryRaw.mockResolvedValue([{ ...pendingApproval, status: "APPROVED" }]);
    const tx = txMockFor([]); // no other approved discounts remain
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const res = await POST(request({ action: "REVERT", reviewRemarks: "Mistake" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/reverted and fee restored/i);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("uses a superadmin session across schools without the schoolId match check", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "sa1", role: "SUPERADMIN" } });
    mockQueryRaw.mockResolvedValue([pendingApproval]);
    const tx = txMockFor();
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const res = await POST(request({ action: "REJECT" }), ctx);
    expect(res.status).toBe(200);
  });
});
