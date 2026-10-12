/**
 * @jest-environment node
 */
import { GET } from "@/app/api/teacher/dashboard/route";

const mockGetServerSession = jest.fn();
const mockGetTeacherAccessibleClassIds = jest.fn();
const mockClassFindMany = jest.fn();
const mockCircularFindMany = jest.fn();
const mockNotificationFindMany = jest.fn();
const mockNotificationCount = jest.fn();
const mockAppointmentFindMany = jest.fn();
const mockEventFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/teacher/teacherClassAccess", () => ({
  getTeacherAccessibleClassIds: (...args: unknown[]) => mockGetTeacherAccessibleClassIds(...args),
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      class: { findMany: (...args: unknown[]) => mockClassFindMany(...args) },
      circular: { findMany: (...args: unknown[]) => mockCircularFindMany(...args) },
      notification: {
        findMany: (...args: unknown[]) => mockNotificationFindMany(...args),
        count: (...args: unknown[]) => mockNotificationCount(...args),
      },
      appointment: { findMany: (...args: unknown[]) => mockAppointmentFindMany(...args) },
      event: { findMany: (...args: unknown[]) => mockEventFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

describe("GET /api/teacher/dashboard", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockGetTeacherAccessibleClassIds.mockReset();
    mockClassFindMany.mockReset();
    mockCircularFindMany.mockReset();
    mockNotificationFindMany.mockReset();
    mockNotificationCount.mockReset();
    mockAppointmentFindMany.mockReset();
    mockEventFindMany.mockReset();
    mockGetTeacherAccessibleClassIds.mockResolvedValue([]);
    mockCircularFindMany.mockResolvedValue([]);
    mockNotificationFindMany.mockResolvedValue([]);
    mockNotificationCount.mockResolvedValue(0);
    mockAppointmentFindMany.mockResolvedValue([]);
    mockEventFindMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 400 when no schoolId in session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("aggregates dashboard stats", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1", name: "Jane" } });
    mockGetTeacherAccessibleClassIds.mockResolvedValue(["c1"]);
    mockClassFindMany.mockResolvedValue([{ id: "c1", _count: { students: 20 } }]);
    mockNotificationCount.mockResolvedValue(3);
    mockAppointmentFindMany.mockResolvedValue([
      { id: "a1", status: "PENDING", student: { fatherName: "F", user: { name: "S" } }, createdAt: new Date() },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats).toEqual({
      totalClasses: 1,
      totalStudents: 20,
      pendingChats: 1,
      unreadAlerts: 3,
    });
  });

  it("falls back to empty events when the events query throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockEventFindMany.mockRejectedValue(new Error("events table missing"));
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toEqual([]);
  });

  it("returns 503 for a database connection error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockGetTeacherAccessibleClassIds.mockRejectedValue({ code: "P1001", message: "Can't reach database server" });
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("returns 500 for a generic error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockGetTeacherAccessibleClassIds.mockRejectedValue(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
