/**
 * @jest-environment node
 */
import { GET } from "@/app/api/leaves/all/route";

const mockGetServerSession = jest.fn();
const mockLeaveRequestFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      leaveRequest: { findMany: (...args: unknown[]) => mockLeaveRequestFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

describe("GET /api/leaves/all", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockLeaveRequestFindMany.mockReset();
  });

  it("returns 401 when the session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns all school leave requests with teacher/approver info", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockLeaveRequestFindMany.mockResolvedValue([{ id: "lv1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([{ id: "lv1" }]);
    expect(mockLeaveRequestFindMany).toHaveBeenCalledWith({
      where: { schoolId: "s1" },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockLeaveRequestFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
