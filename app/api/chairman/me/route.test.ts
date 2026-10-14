/**
 * @jest-environment node
 */
import { GET, invalidateChairmanProfileCache } from "@/app/api/chairman/me/route";

const mockGetServerSession = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
  },
}));

const chairmanSession = { user: { id: "u1", role: "CHAIRMAN" } };

describe("GET /api/chairman/me", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserFindUnique.mockReset();
    invalidateChairmanProfileCache();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that is not chairman or superadmin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("fetches and returns the chairman's profile", async () => {
    mockGetServerSession.mockResolvedValue(chairmanSession);
    mockUserFindUnique.mockResolvedValue({ id: "u1", name: "Chairman One", email: "c1@x.com", role: "CHAIRMAN" });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.name).toBe("Chairman One");
    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } })
    );
  });

  it("serves a cached profile on a subsequent request without querying again", async () => {
    mockGetServerSession.mockResolvedValue(chairmanSession);
    mockUserFindUnique.mockResolvedValue({ id: "u1", name: "Chairman One" });
    await GET();
    mockUserFindUnique.mockClear();

    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("re-fetches after the cache is explicitly invalidated", async () => {
    mockGetServerSession.mockResolvedValue(chairmanSession);
    mockUserFindUnique.mockResolvedValue({ id: "u1", name: "Chairman One" });
    await GET();
    invalidateChairmanProfileCache("u1");
    mockUserFindUnique.mockClear();

    await GET();
    expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
  });

  it("allows a SUPERADMIN session to fetch the profile too", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u2", role: "SUPERADMIN" } });
    mockUserFindUnique.mockResolvedValue({ id: "u2", name: "Super Admin" });
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
