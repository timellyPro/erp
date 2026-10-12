/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/leaves/[id]/reject/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockLeaveRequestFindUnique = jest.fn();
const mockLeaveRequestUpdate = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    leaveRequest: {
      findUnique: (...args: unknown[]) => mockLeaveRequestFindUnique(...args),
      update: (...args: unknown[]) => mockLeaveRequestUpdate(...args),
    },
  },
}));

const ctx = { params: Promise.resolve({ id: "lv1" }) };
const request = () => new Request("http://localhost/api/leaves/lv1/reject", { method: "PATCH" });

const adminSession = { user: { id: "a1", role: "SCHOOLADMIN", schoolId: "s1" } };
const pendingLeave = { id: "lv1", schoolId: "s1", status: "PENDING" };

describe("PATCH /api/leaves/[id]/reject", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockLeaveRequestFindUnique.mockReset();
    mockLeaveRequestUpdate.mockReset();
    mockCreateNotification.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the leave request does not exist", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockLeaveRequestFindUnique.mockResolvedValue(null);
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 409 when the leave is already processed", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockLeaveRequestFindUnique.mockResolvedValue({ ...pendingLeave, status: "APPROVED" });
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(409);
  });

  it("returns 403 when the leave belongs to a different school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockLeaveRequestFindUnique.mockResolvedValue({ ...pendingLeave, schoolId: "other-school" });
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 403 for a role that cannot reject teacher leave", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "s1" } });
    mockLeaveRequestFindUnique.mockResolvedValue(pendingLeave);
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(403);
  });

  it("rejects the leave and notifies the teacher", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockLeaveRequestFindUnique.mockResolvedValue(pendingLeave);
    mockLeaveRequestUpdate.mockResolvedValue({ id: "lv1", status: "REJECTED", teacherId: "t1" });

    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("REJECTED");

    expect(mockLeaveRequestUpdate).toHaveBeenCalledWith({
      where: { id: "lv1" },
      data: { status: "REJECTED", approverId: "a1" },
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "t1",
      "LEAVE",
      "Teacher leave rejected",
      expect.any(String)
    );
  });

  it("returns 500 when the update throws", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockLeaveRequestFindUnique.mockResolvedValue(pendingLeave);
    mockLeaveRequestUpdate.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(500);
  });
});
