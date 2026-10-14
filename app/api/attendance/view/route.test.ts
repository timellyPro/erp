/**
 * @jest-environment node
 */
import { GET } from "@/app/api/attendance/view/route";

const mockGetServerSession = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockAttendanceFindMany = jest.fn();
const mockSwrRead = jest.fn();
const mockSwrWrite = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
  },
}));

// Attendance reads now go through the app_tenant-connected, RLS-restricted
// client (docs/SECURITY_REVIEW.md) instead of the app's normal prisma import.
const mockWithTenantScopedClient = jest.fn(async (_schoolId: string, fn: (tx: unknown) => unknown) =>
  fn({ attendance: { findMany: (...args: unknown[]) => mockAttendanceFindMany(...args) } })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

jest.mock("@/lib/parent/parentPortalSwr", () => ({
  parentPortalSwrRead: (...args: unknown[]) => mockSwrRead(...args),
  parentPortalSwrWrite: (...args: unknown[]) => mockSwrWrite(...args),
  PARENT_LIST_TTL: 60,
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/attendance/view${query}`);
}

describe("GET /api/attendance/view", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindUnique.mockReset();
    mockAttendanceFindMany.mockReset();
    mockSwrRead.mockReset();
    mockSwrWrite.mockReset();
    mockWithTenantScopedClient.mockClear();
    mockSwrRead.mockResolvedValue({ value: null });
    mockSwrWrite.mockResolvedValue(undefined);
  });

  it("reads through the RLS-restricted app_tenant client, scoped to the resolved schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockAttendanceFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockWithTenantScopedClient).toHaveBeenCalledWith("s1", expect.any(Function));
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("scopes to the student's own attendance", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    mockAttendanceFindMany.mockResolvedValue([{ id: "a1" }]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockAttendanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentId: "st1" }) })
    );
  });

  it("filters by classId/studentId query params for staff", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockAttendanceFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("?classId=c1&studentId=st2"));
    expect(res.status).toBe(200);
    expect(mockAttendanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ classId: "c1", studentId: "st2" }) })
    );
  });

  it("returns a cached payload for a student's date-range query", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    mockSwrRead.mockResolvedValue({ value: { attendances: [{ id: "cached" }] } });
    const res = await GET(makeRequest("?startDate=2026-01-01&endDate=2026-01-31"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.attendances).toEqual([{ id: "cached" }]);
    expect(mockAttendanceFindMany).not.toHaveBeenCalled();
  });

  it("writes to cache after a fresh date-range query for a student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    mockAttendanceFindMany.mockResolvedValue([{ id: "a1" }]);
    const res = await GET(makeRequest("?startDate=2026-01-01&endDate=2026-01-31"));
    expect(res.status).toBe(200);
    expect(mockSwrWrite).toHaveBeenCalled();
  });

  it("bypasses cache when refresh=1", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    mockAttendanceFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("?startDate=2026-01-01&endDate=2026-01-31&refresh=1"));
    expect(res.status).toBe(200);
    expect(mockSwrRead).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockAttendanceFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
