/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/student-leaves/[id]/reject/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockRequireSchoolId = jest.fn();
const mockLeaveFindFirst = jest.fn();
const mockLeaveUpdate = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/auth/tenant", () => ({
  requireSchoolId: (...args: unknown[]) => mockRequireSchoolId(...args),
}));

jest.mock("@/lib/notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    studentLeaveRequest: {
      findFirst: (...args: unknown[]) => mockLeaveFindFirst(...args),
      update: (...args: unknown[]) => mockLeaveUpdate(...args),
    },
  },
}));

const ctx = { params: Promise.resolve({ id: "lv1" }) };
const request = (body: unknown = {}) =>
  new Request("http://localhost/api/student-leaves/lv1/reject", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

describe("PATCH /api/student-leaves/[id]/reject", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockRequireSchoolId.mockReset();
    mockLeaveFindFirst.mockReset();
    mockLeaveUpdate.mockReset();
    mockCreateNotification.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot reject leave", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns the requireSchoolId error status when it fails", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockRequireSchoolId.mockResolvedValue({ ok: false, status: 400, message: "School not found" });
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the leave isn't pending or belongs to another school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    mockLeaveFindFirst.mockResolvedValue(null);
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(404);
    expect(mockLeaveUpdate).not.toHaveBeenCalled();
  });

  it("rejects the pending leave scoped to the caller's school without remarks", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    mockLeaveFindFirst.mockResolvedValue({ id: "lv1" });
    mockLeaveUpdate.mockResolvedValue({ id: "lv1", status: "REJECTED", student: { userId: "su1" } });

    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(200);
    expect(mockLeaveFindFirst).toHaveBeenCalledWith({
      where: { id: "lv1", status: "PENDING", schoolId: "s1" },
      select: { id: true },
    });
    expect(mockLeaveUpdate).toHaveBeenCalledWith({
      where: { id: "lv1" },
      data: { status: "REJECTED", approverId: "t1", remarks: null },
      include: { student: { select: { userId: true } } },
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "su1",
      "LEAVE",
      "Student leave rejected",
      "Your student leave request was rejected"
    );
  });

  it("includes remarks in the notification body when provided", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "a1", role: "SCHOOLADMIN" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    mockLeaveFindFirst.mockResolvedValue({ id: "lv1" });
    mockLeaveUpdate.mockResolvedValue({ id: "lv1", status: "REJECTED", student: { userId: "su1" } });

    const res = await PATCH(request({ remarks: "Insufficient documentation" }), ctx);
    expect(res.status).toBe(200);
    expect(mockLeaveUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ remarks: "Insufficient documentation" }) })
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "su1",
      "LEAVE",
      "Student leave rejected",
      expect.stringContaining("Insufficient documentation")
    );
  });

  it("returns 500 when the update throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    mockLeaveFindFirst.mockResolvedValue({ id: "lv1" });
    mockLeaveUpdate.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(500);
  });
});
