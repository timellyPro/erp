/**
 * @jest-environment node
 */
import { GET } from "@/app/api/parent/bootstrap/route";

const mockGetServerSession = jest.fn();
const mockBuildParentBootstrap = jest.fn();
const mockGetParentPortalServerCached = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/parent/buildParentBootstrap", () => ({
  buildParentBootstrap: (...args: unknown[]) => mockBuildParentBootstrap(...args),
}));

jest.mock("@/lib/parent/parentPortalServerCache", () => ({
  getParentPortalServerCached: (...args: unknown[]) => mockGetParentPortalServerCached(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/parent/bootstrap${query}`);
}

describe("GET /api/parent/bootstrap", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockBuildParentBootstrap.mockReset();
    mockGetParentPortalServerCached.mockReset();
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
    mockGetParentPortalServerCached.mockReturnValue({ cached: true });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockBuildParentBootstrap).not.toHaveBeenCalled();
  });

  it("bypasses cache when refresh=1", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockBuildParentBootstrap.mockResolvedValue({ fresh: true });
    const res = await GET(makeRequest("?refresh=1"));
    expect(res.status).toBe(200);
    expect(mockGetParentPortalServerCached).not.toHaveBeenCalled();
  });

  it("returns 404 when the student isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockGetParentPortalServerCached.mockReturnValue(null);
    mockBuildParentBootstrap.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it("builds and returns the bootstrap payload on a cache miss", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockGetParentPortalServerCached.mockReturnValue(null);
    mockBuildParentBootstrap.mockResolvedValue({ student: { id: "st1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockBuildParentBootstrap).toHaveBeenCalledWith("st1", "u1", "s1");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockGetParentPortalServerCached.mockReturnValue(null);
    mockBuildParentBootstrap.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
