/**
 * @jest-environment node
 */
import { POST } from "@/app/api/circular/create/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockCircularCount = jest.fn();
const mockCircularCreate = jest.fn();
const mockGetSchoolUserIds = jest.fn();
const mockCreateNotificationsForUserIds = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    circular: {
      count: (...args: unknown[]) => mockCircularCount(...args),
      create: (...args: unknown[]) => mockCircularCreate(...args),
    },
  },
}));

jest.mock("@/lib/notificationService", () => ({
  getSchoolUserIds: (...args: unknown[]) => mockGetSchoolUserIds(...args),
  createNotificationsForUserIds: (...args: unknown[]) => mockCreateNotificationsForUserIds(...args),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/circular/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/circular/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockCircularCount.mockReset();
    mockCircularCreate.mockReset();
    mockGetSchoolUserIds.mockReset();
    mockCreateNotificationsForUserIds.mockReset();
    mockCircularCount.mockResolvedValue(0);
    mockGetSchoolUserIds.mockResolvedValue([]);
    mockCreateNotificationsForUserIds.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({ subject: "S", content: "C" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when subject or content is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest({ subject: "S" }));
    expect(res.status).toBe(400);
  });

  it("creates a draft circular without notifying anyone", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockCircularCreate.mockResolvedValue({ id: "c1", publishStatus: "DRAFT" });
    const res = await POST(makeRequest({ subject: "S", content: "C" }));
    expect(res.status).toBe(201);
    expect(mockCreateNotificationsForUserIds).not.toHaveBeenCalled();
  });

  it("creates a published circular and notifies the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockCircularCreate.mockResolvedValue({ id: "c1", publishStatus: "PUBLISHED" });
    mockGetSchoolUserIds.mockResolvedValue(["a", "b", "u1"]);
    const res = await POST(makeRequest({ subject: "S", content: "C", publishStatus: "PUBLISHED" }));
    expect(res.status).toBe(201);
    expect(mockCreateNotificationsForUserIds).toHaveBeenCalledWith(
      ["a", "b"],
      "CIRCULAR",
      expect.any(String),
      expect.any(String)
    );
  });

  it("still succeeds when the notification step fails", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockCircularCreate.mockResolvedValue({ id: "c1", publishStatus: "PUBLISHED" });
    mockGetSchoolUserIds.mockRejectedValue(new Error("notify failed"));
    const res = await POST(makeRequest({ subject: "S", content: "C", publishStatus: "PUBLISHED" }));
    expect(res.status).toBe(201);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockCircularCreate.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ subject: "S", content: "C" }));
    expect(res.status).toBe(500);
  });
});
