/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/mine/route";

const mockGetServerSession = jest.fn();
const mockBuildParentFeesMine = jest.fn();
const mockParentPortalSwrRead = jest.fn();
const mockParentPortalSwrWrite = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/parent/buildParentFeesMine", () => ({
  buildParentFeesMine: (...args: unknown[]) => mockBuildParentFeesMine(...args),
}));

jest.mock("@/lib/parent/parentPortalSwr", () => ({
  parentPortalSwrRead: (...args: unknown[]) => mockParentPortalSwrRead(...args),
  parentPortalSwrWrite: (...args: unknown[]) => mockParentPortalSwrWrite(...args),
  PARENT_LIST_TTL: 30_000,
}));

const request = (query = "") => new Request(`http://localhost/api/fees/mine${query}`);

const studentSession = {
  user: { id: "u1", role: "STUDENT", studentId: "stu1", schoolId: "s1" },
};

describe("GET /api/fees/mine", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockBuildParentFeesMine.mockReset();
    mockParentPortalSwrRead.mockReset().mockResolvedValue({ value: null });
    mockParentPortalSwrWrite.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-student session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns a cached fee payload without rebuilding it", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockParentPortalSwrRead.mockResolvedValue({ value: { finalFee: 900 } });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fee).toEqual({ finalFee: 900 });
    expect(mockBuildParentFeesMine).not.toHaveBeenCalled();
  });

  it("builds and caches the fee when nothing is cached", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockBuildParentFeesMine.mockResolvedValue({ finalFee: 900 });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fee).toEqual({ finalFee: 900 });
    expect(mockParentPortalSwrWrite).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: "s1", value: { finalFee: 900 } })
    );
  });

  it("bypasses the cache entirely when refresh=1 is set", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockBuildParentFeesMine.mockResolvedValue({ finalFee: 900 });
    const res = await GET(request("?refresh=1"));
    expect(res.status).toBe(200);
    expect(mockParentPortalSwrRead).not.toHaveBeenCalled();
    expect(mockParentPortalSwrWrite).not.toHaveBeenCalled();
  });

  it("returns 404 when the student has no fee record", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockBuildParentFeesMine.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(404);
  });

  it("skips the cache read/write entirely when the session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "STUDENT", studentId: "stu1" },
    });
    mockBuildParentFeesMine.mockResolvedValue({ finalFee: 900 });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockParentPortalSwrRead).not.toHaveBeenCalled();
    expect(mockParentPortalSwrWrite).not.toHaveBeenCalled();
  });
});
