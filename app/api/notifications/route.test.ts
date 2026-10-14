/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/notifications/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockNotificationFindMany = jest.fn();
const mockNotificationCount = jest.fn();
const mockNotificationCreate = jest.fn();
const mockApiMemGetSwr = jest.fn();
const mockApiMemSet = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    notification: {
      findMany: (...args: unknown[]) => mockNotificationFindMany(...args),
      count: (...args: unknown[]) => mockNotificationCount(...args),
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
  },
}));

jest.mock("@/lib/cache/apiMemoryCache", () => ({
  apiMemGetSwr: (...args: unknown[]) => mockApiMemGetSwr(...args),
  apiMemSet: (...args: unknown[]) => mockApiMemSet(...args),
}));

function makeGetRequest(query = "") {
  return new Request(`http://localhost/api/notifications${query}`);
}
function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/notifications", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/notifications", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockNotificationFindMany.mockReset();
    mockNotificationCount.mockReset();
    mockApiMemGetSwr.mockReset();
    mockApiMemSet.mockReset();
    mockApiMemGetSwr.mockReturnValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns a cached payload when present", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockApiMemGetSwr.mockReturnValue({ value: { notifications: [{ id: "n1" }], unreadCount: 1 } });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notifications).toEqual([{ id: "n1" }]);
    expect(mockNotificationFindMany).not.toHaveBeenCalled();
  });

  it("queries the database and caches the result on a miss", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNotificationFindMany.mockResolvedValue([{ id: "n1" }]);
    mockNotificationCount.mockResolvedValue(1);
    const res = await GET(makeGetRequest("?onlyUnread=true&take=5"));
    expect(res.status).toBe(200);
    expect(mockNotificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u1", isRead: false }), take: 5 })
    );
    expect(mockApiMemSet).toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNotificationFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

describe("POST /api/notifications", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockNotificationCreate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when title, message, or type is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makePostRequest({ title: "Hi" }));
    expect(res.status).toBe(400);
  });

  it("creates the notification and defaults userId to the session user", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNotificationCreate.mockResolvedValue({ id: "n1" });
    const res = await POST(makePostRequest({ title: "Hi", message: "Msg", type: "GENERAL" }));
    expect(res.status).toBe(201);
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", title: "Hi", message: "Msg", type: "GENERAL" }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNotificationCreate.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makePostRequest({ title: "Hi", message: "Msg", type: "GENERAL" }));
    expect(res.status).toBe(500);
  });
});
