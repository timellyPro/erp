/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/records/route";

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockStudentFeeFindMany = jest.fn();
const mockGetCached = jest.fn();
const mockSetCached = jest.fn();

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

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      studentFee: { findMany: (...args: unknown[]) => mockStudentFeeFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

const request = (query = "") => new Request(`http://localhost/api/fees/records${query}`);

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

function feeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sf1",
    studentId: "stu1",
    totalFee: 1000,
    finalFee: 900,
    amountPaid: 300,
    remainingFee: 600,
    discountPercent: 10,
    student: {
      id: "stu1",
      status: "Active",
      user: { name: "Student One", email: "s1@example.com" },
      class: { id: "c1", name: "5", section: "A" },
    },
    ...overrides,
  };
}

describe("GET /api/fees/records", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockStudentFeeFindMany.mockReset();
    mockGetCached.mockReset().mockReturnValue(null);
    mockSetCached.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot view fee records", async () => {
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

  it("returns cached records without querying the database", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockGetCached.mockReturnValue({ fees: [{ id: "cached" }], nextCursor: null });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fees).toEqual([{ id: "cached" }]);
    expect(mockStudentFeeFindMany).not.toHaveBeenCalled();
  });

  it("computes rounded totals, remaining fee, and discount amount per row", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFeeFindMany.mockResolvedValue([feeRow()]);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fees).toHaveLength(1);
    expect(json.fees[0]).toMatchObject({
      id: "sf1",
      totalFee: 1000,
      finalFee: 900,
      amountPaid: 300,
      remainingFee: 600,
      discountAmount: 100,
      feeTypeDueAmount: 600,
    });
    expect(json.nextCursor).toBeNull();
    expect(mockSetCached).toHaveBeenCalled();
  });

  it("paginates using a cursor and reports nextCursor when more rows exist", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFeeFindMany.mockResolvedValue([
      feeRow({ id: "sf1", studentId: "stu1" }),
      feeRow({ id: "sf2", studentId: "stu2" }),
    ]);

    const res = await GET(request("?take=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fees).toHaveLength(1);
    expect(json.nextCursor).toBe("stu1");
    expect(mockStudentFeeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 })
    );
  });

  it("applies the cursor param as a skip-1 continuation", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFeeFindMany.mockResolvedValue([feeRow({ id: "sf2", studentId: "stu2" })]);

    const res = await GET(request("?take=1&cursor=stu1"));
    expect(res.status).toBe(200);
    expect(mockStudentFeeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { studentId: "stu1" }, skip: 1 })
    );
  });

  it("clamps an out-of-range take to the [1, 10000] bounds", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFeeFindMany.mockResolvedValue([]);

    const res = await GET(request("?take=999999"));
    expect(res.status).toBe(200);
    expect(mockStudentFeeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10001 })
    );
  });
});
