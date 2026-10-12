/**
 * @jest-environment node
 */
import { GET } from "@/app/api/chairman/dashboard/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockQueryRaw = jest.fn();
const mockComputeCurrentAndPreviousFeeStats = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

jest.mock("@/lib/fees/computeFeeSummaryStats", () => ({
  computeCurrentAndPreviousFeeStats: (...args: unknown[]) => mockComputeCurrentAndPreviousFeeStats(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/chairman/dashboard${query}`) as unknown as import("next/server").NextRequest;
}

const feeStats = {
  totalFee: 1000,
  totalDiscount: 100,
  totalDue: 200,
  totalCollected: 700,
  previousYearTotalFee: 0,
  previousYearCollected: 0,
  previousYearDue: 0,
};

describe("GET /api/chairman/dashboard", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockQueryRaw.mockReset();
    mockComputeCurrentAndPreviousFeeStats.mockReset();
    mockComputeCurrentAndPreviousFeeStats.mockResolvedValue(feeStats);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a disallowed role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER", schoolId: "s1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 when no schoolId in session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "CHAIRMAN" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("computes and returns the dashboard summary", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "CHAIRMAN", schoolId: "s1" } });
    mockQueryRaw.mockResolvedValue([
      {
        schoolName: "Greenwood",
        totalStudents: BigInt(100),
        activeStudents: BigInt(90),
        totalClasses: BigInt(10),
        totalTeachers: BigInt(15),
        todayCollection: 500,
        totalCollection: 7000,
        pendingDiscounts: BigInt(2),
        approvedDiscounts: BigInt(5),
        rejectedDiscounts: BigInt(1),
      },
    ]);
    const res = await GET(makeRequest("?date=2026-01-10"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary.schoolName).toBe("Greenwood");
    expect(json.summary.totalStudents).toBe(100);
    expect(json.summary.netFees).toBe(900);
  });

  it("returns a cached summary on a second call for the same day", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "CHAIRMAN", schoolId: "s1" } });
    mockQueryRaw.mockResolvedValue([{ schoolName: "Greenwood", totalStudents: BigInt(1), activeStudents: BigInt(1), totalClasses: BigInt(1), totalTeachers: BigInt(1), todayCollection: 0, totalCollection: 0, pendingDiscounts: BigInt(0), approvedDiscounts: BigInt(0), rejectedDiscounts: BigInt(0) }]);
    await GET(makeRequest("?date=2026-05-05"));
    mockQueryRaw.mockClear();
    const res = await GET(makeRequest("?date=2026-05-05"));
    expect(res.status).toBe(200);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "CHAIRMAN", schoolId: "s1" } });
    mockQueryRaw.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest("?date=2026-09-09"));
    expect(res.status).toBe(500);
  });
});
