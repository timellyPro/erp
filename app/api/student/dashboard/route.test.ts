/**
 * @jest-environment node
 */
import { GET } from "@/app/api/student/dashboard/route";

const mockGetServerSession = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockPurgeExpiredNewsFeeds = jest.fn();
const mockBuildParentDashboardFast = jest.fn();
const mockBuildParentDashboardFull = jest.fn();
const mockParentPortalSwrRead = jest.fn();
const mockParentPortalSwrWrite = jest.fn();
const mockIsActiveStudent = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/newsfeedRetention", () => ({
  purgeExpiredNewsFeeds: (...args: unknown[]) => mockPurgeExpiredNewsFeeds(...args),
}));

jest.mock("@/lib/parent/buildParentDashboard", () => ({
  buildParentDashboardFast: (...args: unknown[]) => mockBuildParentDashboardFast(...args),
  buildParentDashboardFull: (...args: unknown[]) => mockBuildParentDashboardFull(...args),
}));

jest.mock("@/lib/students/studentStatus", () => ({
  isActiveStudent: (...args: unknown[]) => mockIsActiveStudent(...args),
}));

jest.mock("@/lib/parent/parentPortalSwr", () => ({
  parentPortalSwrRead: (...args: unknown[]) => mockParentPortalSwrRead(...args),
  parentPortalSwrWrite: (...args: unknown[]) => mockParentPortalSwrWrite(...args),
  PARENT_DASHBOARD_FAST_TTL: 10_000,
  PARENT_DASHBOARD_FULL_TTL: 30_000,
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
  },
}));

const request = (query = "") => new Request(`http://localhost/api/student/dashboard${query}`);

const studentSession = { user: { id: "u1", studentId: "stu1", schoolId: "s1" } };

describe("GET /api/student/dashboard", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindFirst.mockReset();
    mockPurgeExpiredNewsFeeds.mockReset().mockResolvedValue(undefined);
    mockBuildParentDashboardFast.mockReset();
    mockBuildParentDashboardFull.mockReset();
    mockParentPortalSwrRead.mockReset().mockResolvedValue({ value: null });
    mockParentPortalSwrWrite.mockReset().mockResolvedValue(undefined);
    mockIsActiveStudent.mockReset().mockReturnValue(true);
    mockStudentFindFirst.mockResolvedValue({ status: "Active" });
  });

  it("returns 401 when the session has no studentId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 400 when the session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "stu1" } });
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns 404 when the student record is not found", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(404);
  });

  it("returns 403 when the student is inactive", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockIsActiveStudent.mockReturnValue(false);
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns a cached payload without building a fresh one", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockParentPortalSwrRead.mockResolvedValue({ value: { greeting: "hi" } });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ greeting: "hi" });
    expect(mockBuildParentDashboardFull).not.toHaveBeenCalled();
  });

  it("builds the fast dashboard and skips the newsfeed purge when fast=1", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockBuildParentDashboardFast.mockResolvedValue({ fast: true });
    const res = await GET(request("?fast=1"));
    expect(res.status).toBe(200);
    expect(mockBuildParentDashboardFast).toHaveBeenCalledWith("stu1");
    expect(mockBuildParentDashboardFull).not.toHaveBeenCalled();
    expect(mockPurgeExpiredNewsFeeds).not.toHaveBeenCalled();
  });

  it("builds the full dashboard and triggers the newsfeed purge by default", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockBuildParentDashboardFull.mockResolvedValue({ full: true });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockBuildParentDashboardFull).toHaveBeenCalledWith("stu1", "u1");
    expect(mockPurgeExpiredNewsFeeds).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the dashboard builder returns null", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockBuildParentDashboardFull.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(404);
  });

  it("bypasses the cache entirely when refresh=1 is set", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockBuildParentDashboardFull.mockResolvedValue({ full: true });
    const res = await GET(request("?refresh=1"));
    expect(res.status).toBe(200);
    expect(mockParentPortalSwrRead).not.toHaveBeenCalled();
    expect(mockParentPortalSwrWrite).not.toHaveBeenCalled();
  });

  it("maps a database-unreachable error to 503", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockBuildParentDashboardFull.mockRejectedValue({ code: "P1001", message: "Can't reach database server" });
    const res = await GET(request());
    expect(res.status).toBe(503);
  });

  it("maps a statement timeout error to 408", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockBuildParentDashboardFull.mockRejectedValue(new Error("statement timeout"));
    const res = await GET(request());
    expect(res.status).toBe(408);
  });

  it("returns 500 for an unrelated error", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockBuildParentDashboardFull.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
