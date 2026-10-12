/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/student/[id]/discount-approvals/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockQueryRaw = jest.fn();

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

const ctx = { params: { id: "stu1" } };
const request = () => new Request("http://localhost/api/fees/student/stu1/discount-approvals");

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const dbRow = {
  id: "app1",
  status: "PENDING" as const,
  discountFixedAmount: 100,
  discountFeeHeadKey: "TUITION",
  discountFeeHeadLabel: "Tuition",
  discountRemarks: "Sibling discount",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  schoolId: "s1",
};

describe("GET /api/fees/student/[id]/discount-approvals", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockQueryRaw.mockReset().mockResolvedValue([dbRow]);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot view discount approvals", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET(request(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns the student's recent discount approvals mapped for the client", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approvals).toEqual([
      {
        id: "app1",
        status: "PENDING",
        discountFixedAmount: 100,
        discountFeeHeadKey: "TUITION",
        discountFeeHeadLabel: "Tuition",
        discountRemarks: "Sibling discount",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("allows a TEACHER or CHAIRMAN role to view approvals", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "CHAIRMAN", schoolId: "s1" } });
    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
  });

  it("scopes the query by the caller's schoolId when present (non-superadmin)", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    await GET(request(), ctx);
    expect(mockQueryRaw).toHaveBeenCalledWith(
      expect.anything(),
      "stu1",
      "SCHOOLADMIN",
      "s1",
      "s1"
    );
  });
});
