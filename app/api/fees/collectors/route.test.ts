/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/collectors/route";

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockPaymentGroupBy = jest.fn();
const mockUserFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      payment: { groupBy: (...args: unknown[]) => mockPaymentGroupBy(...args) },
      user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("GET /api/fees/collectors", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockPaymentGroupBy.mockReset();
    mockUserFindMany.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot view collectors", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("returns an empty list when nobody has recorded offline payments", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentGroupBy.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.collectors).toEqual([]);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("prefers the payment's collectedByName snapshot over the user's current name", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentGroupBy.mockResolvedValue([
      { collectedByUserId: "u2", _max: { collectedByName: "Snapshot Name" } },
    ]);
    mockUserFindMany.mockResolvedValue([{ id: "u2", name: "Current Name", email: "u2@example.com" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.collectors).toEqual([{ userId: "u2", name: "Snapshot Name" }]);
  });

  it("falls back to the user's current name, then email, then 'Staff' when there is no snapshot", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentGroupBy.mockResolvedValue([
      { collectedByUserId: "u2", _max: { collectedByName: null } },
      { collectedByUserId: "u3", _max: { collectedByName: null } },
    ]);
    mockUserFindMany.mockResolvedValue([
      { id: "u2", name: null, email: "u2@example.com" },
      { id: "u3", name: null, email: null },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.collectors).toEqual(
      expect.arrayContaining([
        { userId: "u2", name: "u2@example.com" },
        { userId: "u3", name: "Staff" },
      ])
    );
  });

  it("sorts collectors alphabetically by name", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockPaymentGroupBy.mockResolvedValue([
      { collectedByUserId: "u2", _max: { collectedByName: "Zeta" } },
      { collectedByUserId: "u3", _max: { collectedByName: "Alpha" } },
    ]);
    mockUserFindMany.mockResolvedValue([
      { id: "u2", name: "Zeta", email: null },
      { id: "u3", name: "Alpha", email: null },
    ]);
    const res = await GET();
    const json = await res.json();
    expect(json.collectors.map((c: { name: string }) => c.name)).toEqual(["Alpha", "Zeta"]);
  });
});
