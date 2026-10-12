/**
 * @jest-environment node
 */
import { GET } from "@/app/api/parent/profile-shell/route";

const mockGetServerSession = jest.fn();
const mockBuildParentProfileShell = jest.fn();
const mockSwrRead = jest.fn();
const mockSwrWrite = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/parent/buildParentProfileShell", () => ({
  buildParentProfileShell: (...args: unknown[]) => mockBuildParentProfileShell(...args),
}));

jest.mock("@/lib/parent/parentPortalSwr", () => ({
  parentPortalSwrRead: (...args: unknown[]) => mockSwrRead(...args),
  parentPortalSwrWrite: (...args: unknown[]) => mockSwrWrite(...args),
  PARENT_LIST_TTL: 60,
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/parent/profile-shell${query}`);
}

describe("GET /api/parent/profile-shell", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockBuildParentProfileShell.mockReset();
    mockSwrRead.mockReset();
    mockSwrWrite.mockReset();
    mockSwrRead.mockResolvedValue({ value: null });
    mockSwrWrite.mockResolvedValue(undefined);
  });

  it("returns 401 when the session has no studentId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when the session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns a cached payload when present", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockSwrRead.mockResolvedValue({ value: { cached: true } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockBuildParentProfileShell).not.toHaveBeenCalled();
  });

  it("returns 404 when the student isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockBuildParentProfileShell.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it("builds, caches, and returns the profile shell on a cache miss", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockBuildParentProfileShell.mockResolvedValue({ student: { id: "st1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockSwrWrite).toHaveBeenCalled();
  });

  it("bypasses cache read/write when refresh=1", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockBuildParentProfileShell.mockResolvedValue({ student: { id: "st1" } });
    const res = await GET(makeRequest("?refresh=1"));
    expect(res.status).toBe(200);
    expect(mockSwrRead).not.toHaveBeenCalled();
    expect(mockSwrWrite).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockBuildParentProfileShell.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
