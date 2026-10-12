/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/notifications/mark-all-read/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockNotificationUpdateMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    notification: { updateMany: (...args: unknown[]) => mockNotificationUpdateMany(...args) },
  },
}));

describe("PATCH /api/notifications/mark-all-read", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockNotificationUpdateMany.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH();
    expect(res.status).toBe(401);
  });

  it("marks all of the caller's unread notifications as read", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNotificationUpdateMany.mockResolvedValue({ count: 3 });
    const res = await PATCH();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", isRead: false },
      data: { isRead: true },
    });
  });

  it("returns 500 when the update throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNotificationUpdateMany.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH();
    expect(res.status).toBe(500);
  });
});
