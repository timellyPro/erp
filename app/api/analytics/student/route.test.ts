/**
 * @jest-environment node
 */
import { GET } from "@/app/api/analytics/student/route";

const mockGetServerSession = jest.fn();
const mockComputeParentAnalytics = jest.fn();
const mockParentPortalSwrRead = jest.fn();
const mockParentPortalSwrWrite = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/parent/computeParentAnalytics", () => ({
  computeParentAnalytics: (...args: unknown[]) => mockComputeParentAnalytics(...args),
}));

jest.mock("@/lib/parent/parentPortalSwr", () => ({
  parentPortalSwrRead: (...args: unknown[]) => mockParentPortalSwrRead(...args),
  parentPortalSwrWrite: (...args: unknown[]) => mockParentPortalSwrWrite(...args),
  PARENT_ANALYTICS_TTL: 30_000,
}));

const request = (query = "") => new Request(`http://localhost/api/analytics/student${query}`);

const studentSession = { user: { id: "u1", studentId: "stu1", schoolId: "s1" } };

describe("GET /api/analytics/student", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockComputeParentAnalytics.mockReset();
    mockParentPortalSwrRead.mockReset().mockResolvedValue({ value: null });
    mockParentPortalSwrWrite.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 400 when no student is linked to the account", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns 400 when the session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "stu1" } });
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns a cached payload without recomputing", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockParentPortalSwrRead.mockResolvedValue({ value: { attendance: 90 } });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ attendance: 90 });
    expect(mockComputeParentAnalytics).not.toHaveBeenCalled();
  });

  it("computes and caches fresh analytics when nothing is cached", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockComputeParentAnalytics.mockResolvedValue({ attendance: 80 });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ attendance: 80 });
    expect(mockComputeParentAnalytics).toHaveBeenCalledWith("stu1", { fast: false });
    expect(mockParentPortalSwrWrite).toHaveBeenCalled();
  });

  it("passes fast=true through to computeParentAnalytics when fast=1", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockComputeParentAnalytics.mockResolvedValue({ attendance: 80 });
    await GET(request("?fast=1"));
    expect(mockComputeParentAnalytics).toHaveBeenCalledWith("stu1", { fast: true });
  });

  it("returns 404 when the analytics builder returns null", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockComputeParentAnalytics.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(404);
  });

  it("bypasses the cache entirely when refresh=1 is set", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockComputeParentAnalytics.mockResolvedValue({ attendance: 80 });
    const res = await GET(request("?refresh=1"));
    expect(res.status).toBe(200);
    expect(mockParentPortalSwrRead).not.toHaveBeenCalled();
    expect(mockParentPortalSwrWrite).not.toHaveBeenCalled();
  });

  it("returns 500 when the analytics builder throws", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockComputeParentAnalytics.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
