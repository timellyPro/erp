/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/discount-approvals/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockQueryRaw = jest.fn();
const mockGetCached = jest.fn();
const mockSetCached = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/discountApprovalsListCache", () => ({
  getDiscountApprovalsListCached: (...args: unknown[]) => mockGetCached(...args),
  setDiscountApprovalsListCached: (...args: unknown[]) => mockSetCached(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

const request = (query = "") =>
  new (require("next/server").NextRequest)(
    `http://localhost/api/fees/discount-approvals${query}`
  );

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const dbRow = {
  id: "app1",
  status: "PENDING",
  totalFee: 1000,
  discountPercent: 10,
  discountFixedAmount: null,
  finalFee: 900,
  discountFeeHeadLabel: "Tuition",
  discountRemarks: "Sibling discount",
  reviewRemarks: null,
  reviewedAt: null,
  createdAt: new Date("2024-01-01"),
  studentId: "stu1",
  admissionNumber: "A1",
  fatherName: "Father One",
  studentName: "Student One",
  className: "5",
  section: "A",
  requestedByName: "Admin One",
  requestedByEmail: "admin@example.com",
  reviewedByName: null,
  reviewedByEmail: null,
};

describe("GET /api/fees/discount-approvals", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockQueryRaw.mockReset().mockResolvedValue([dbRow]);
    mockGetCached.mockReset().mockReturnValue(null);
    mockSetCached.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot review discounts", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns 400 when no schoolId is available", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("ignores a client-supplied schoolId query param when the session has none (regression: prior fallback allowed cross-tenant reads)", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    const res = await GET(request("?schoolId=s2"));
    expect(res.status).toBe(400);
    expect(mockGetCached).not.toHaveBeenCalledWith("s2:PENDING");
  });

  it("returns cached approvals without querying the database", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetCached.mockReturnValue([{ id: "cached-app" }]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approvals).toEqual([{ id: "cached-app" }]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("defaults to PENDING status, maps rows, and caches the result", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approvals).toHaveLength(1);
    expect(json.approvals[0]).toMatchObject({
      id: "app1",
      status: "PENDING",
      finalFee: 900,
      student: {
        id: "stu1",
        admissionNumber: "A1",
        fatherName: "Father One",
        user: { name: "Student One" },
        class: { name: "5", section: "A" },
      },
      requestedBy: { name: "Admin One", email: "admin@example.com" },
      reviewedBy: null,
    });
    expect(mockSetCached).toHaveBeenCalledWith(
      "s1:PENDING",
      expect.arrayContaining([expect.objectContaining({ id: "app1", finalFee: 900 })])
    );
  });

  it("falls back to PENDING for an unrecognized status value", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await GET(request("?status=BOGUS"));
    expect(res.status).toBe(200);
    expect(mockGetCached).toHaveBeenCalledWith("s1:PENDING");
  });

  it("accepts status=ALL and caches under the ALL key", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await GET(request("?status=all"));
    expect(res.status).toBe(200);
    expect(mockGetCached).toHaveBeenCalledWith("s1:ALL");
    expect(mockSetCached).toHaveBeenCalledWith("s1:ALL", expect.any(Array));
  });
});
