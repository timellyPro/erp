/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/notifications/[id]/read/route";

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

const ctx = { params: Promise.resolve({ id: "n1" }) };
const request = () => new Request("http://localhost/api/notifications/n1/read", { method: "PATCH" });

describe("PATCH /api/notifications/[id]/read", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockNotificationUpdateMany.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the notification does not belong to the caller", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNotificationUpdateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(404);
  });

  it("marks the notification as read when it belongs to the caller", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNotificationUpdateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
      where: { id: "n1", userId: "u1" },
      data: { isRead: true },
    });
  });

  it("returns 500 when the update throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNotificationUpdateMany.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(500);
  });
});
