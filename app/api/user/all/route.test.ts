/**
 * @jest-environment node
 */
import { GET } from "@/app/api/user/all/route";

const mockGetServerSession = jest.fn();
const mockUserFindMany = jest.fn();
const mockUserCount = jest.fn();
const mockGetUserListCached = jest.fn();
const mockSetUserListCached = jest.fn();
const mockUserListCacheKey = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/school/userListServerCache", () => ({
  getUserListCached: (...args: unknown[]) => mockGetUserListCached(...args),
  setUserListCached: (...args: unknown[]) => mockSetUserListCached(...args),
  userListCacheKey: (...args: unknown[]) => mockUserListCacheKey(...args),
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      user: {
        findMany: (...args: unknown[]) => mockUserFindMany(...args),
        count: (...args: unknown[]) => mockUserCount(...args),
      },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

const request = (query = "") => new Request(`http://localhost/api/user/all${query}`);

const session = { user: { id: "u1", schoolId: "s1" } };

describe("GET /api/user/all", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserFindMany.mockReset().mockResolvedValue([]);
    mockUserCount.mockReset().mockResolvedValue(0);
    mockGetUserListCached.mockReset().mockReturnValue(null);
    mockSetUserListCached.mockReset();
    mockUserListCacheKey.mockReset().mockReturnValue("cache-key-1");
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 400 when the session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns a cached page without querying the database", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockGetUserListCached.mockReturnValue({ users: [{ id: "cached" }], total: 1, page: 1, pageSize: 10 });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.users).toEqual([{ id: "cached" }]);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("filters by a valid role and paginates", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserFindMany.mockResolvedValue([{ id: "u2", role: "TEACHER" }]);
    mockUserCount.mockResolvedValue(1);

    const res = await GET(request("?page=2&pageSize=5&role=TEACHER"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.page).toBe(2);
    expect(json.pageSize).toBe(5);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "s1", role: "TEACHER" },
        skip: 5,
        take: 5,
      })
    );
    expect(mockSetUserListCached).toHaveBeenCalledWith("cache-key-1", json);
  });

  it("ignores an invalid role value", async () => {
    mockGetServerSession.mockResolvedValue(session);
    const res = await GET(request("?role=BOGUS"));
    expect(res.status).toBe(200);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: "s1" } })
    );
  });

  it("applies a case-insensitive name/email search filter", async () => {
    mockGetServerSession.mockResolvedValue(session);
    const res = await GET(request("?search=jane"));
    expect(res.status).toBe(200);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: "s1",
          OR: [
            { name: { contains: "jane", mode: "insensitive" } },
            { email: { contains: "jane", mode: "insensitive" } },
          ],
        },
      })
    );
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
