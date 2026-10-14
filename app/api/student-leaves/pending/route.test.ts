/**
 * @jest-environment node
 */
import { GET } from "@/app/api/student-leaves/pending/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockLeaveFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
  },
}));

// Reads now go through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md) instead of the app's normal prisma import.
const mockWithTenantScopedClient = jest.fn(async (_schoolId: string, fn: (tx: unknown) => unknown) =>
  fn({ studentLeaveRequest: { findMany: (...args: unknown[]) => mockLeaveFindMany(...args) } })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

describe("GET /api/student-leaves/pending", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockLeaveFindMany.mockReset();
    mockWithTenantScopedClient.mockClear();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot view pending leaves", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("returns only PENDING leaves for the resolved school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockLeaveFindMany.mockResolvedValue([{ id: "lv1", status: "PENDING" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([{ id: "lv1", status: "PENDING" }]);
    expect(mockLeaveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: "s1", status: "PENDING" } })
    );
  });

  it("resolves schoolId via admin/teacher association when the session has none", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    mockSchoolFindFirst.mockResolvedValue({ id: "s2" });
    mockLeaveFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockLeaveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: "s2", status: "PENDING" } })
    );
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER", schoolId: "s1" } });
    mockLeaveFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
