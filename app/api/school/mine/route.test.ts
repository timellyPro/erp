/**
 * @jest-environment node
 */
import { GET } from "@/app/api/school/mine/route";

const mockGetServerSession = jest.fn();
const mockFindUnique = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

jest.mock("@/lib/tenantCache", () => ({
  swrGet: jest.fn().mockResolvedValue(null),
  swrSet: jest.fn().mockResolvedValue(undefined),
}));

describe("GET /api/school/mine", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindUnique.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.message).toBe("Unauthorized");
    expect(json.school).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns school null when session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", schoolId: null },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.school).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 403 when school is not active", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", schoolId: "s1", schoolIsActive: false },
    });
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.message).toBe("School is paused");
    expect(json.school).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns school when session has schoolId and school is active", async () => {
    const schoolData = { id: "s1", name: "Test School", address: "Addr", location: "Loc" };
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", schoolId: "s1" },
    });
    mockFindUnique.mockResolvedValue(schoolData);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.school).toEqual(schoolData);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "s1" },
      include: {
        admins: {
          where: { role: "SCHOOLADMIN", photoUrl: { not: null } },
          select: { photoUrl: true },
          take: 1,
        },
      },
    });
  });
});
