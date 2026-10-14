/**
 * @jest-environment node
 */
import { GET } from "@/app/api/student-leaves/my/route";

const mockGetServerSession = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockLeaveFindMany = jest.fn();
const mockParentPortalSwrRead = jest.fn();
const mockParentPortalSwrWrite = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/parent/parentPortalSwr", () => ({
  parentPortalSwrRead: (...args: unknown[]) => mockParentPortalSwrRead(...args),
  parentPortalSwrWrite: (...args: unknown[]) => mockParentPortalSwrWrite(...args),
  PARENT_LIST_TTL: 30_000,
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
  },
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      studentLeaveRequest: { findMany: (...args: unknown[]) => mockLeaveFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

const request = (query = "") => new Request(`http://localhost/api/student-leaves/my${query}`);

describe("GET /api/student-leaves/my", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindFirst.mockReset();
    mockLeaveFindMany.mockReset();
    mockParentPortalSwrRead.mockReset().mockResolvedValue({ value: null });
    mockParentPortalSwrWrite.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 400 when no student record is linked to the user", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns a cached list without querying the database", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockStudentFindFirst.mockResolvedValue({ id: "stu1", schoolId: "s1" });
    mockParentPortalSwrRead.mockResolvedValue({ value: [{ id: "lv1" }] });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([{ id: "lv1" }]);
    expect(mockLeaveFindMany).not.toHaveBeenCalled();
  });

  it("loads and caches the leaves when nothing is cached", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockStudentFindFirst.mockResolvedValue({ id: "stu1", schoolId: "s1" });
    mockLeaveFindMany.mockResolvedValue([{ id: "lv1" }]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([{ id: "lv1" }]);
    expect(mockParentPortalSwrWrite).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: "s1", value: [{ id: "lv1" }] })
    );
  });

  it("bypasses the cache entirely when refresh=1 is set", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockStudentFindFirst.mockResolvedValue({ id: "stu1", schoolId: "s1" });
    mockLeaveFindMany.mockResolvedValue([{ id: "lv1" }]);
    const res = await GET(request("?refresh=1"));
    expect(res.status).toBe(200);
    expect(mockParentPortalSwrRead).not.toHaveBeenCalled();
    expect(mockParentPortalSwrWrite).not.toHaveBeenCalled();
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockStudentFindFirst.mockResolvedValue({ id: "stu1", schoolId: "s1" });
    mockLeaveFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
