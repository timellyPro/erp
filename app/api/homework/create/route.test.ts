/**
 * @jest-environment node
 */
import { POST } from "@/app/api/homework/create/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockClassFindFirst = jest.fn();
const mockHomeworkCreate = jest.fn();
const mockStudentFindMany = jest.fn();
const mockCreateNotificationsForUserIds = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    homework: { create: (...args: unknown[]) => mockHomeworkCreate(...args) },
    student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
  },
}));

jest.mock("@/lib/notificationService", () => ({
  createNotificationsForUserIds: (...args: unknown[]) => mockCreateNotificationsForUserIds(...args),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/homework/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = { title: "HW1", description: "Do exercises", subject: "Math", classId: "c1" };

describe("POST /api/homework/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindFirst.mockReset();
    mockHomeworkCreate.mockReset();
    mockStudentFindMany.mockReset();
    mockCreateNotificationsForUserIds.mockReset();
    mockCreateNotificationsForUserIds.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    const res = await POST(makeRequest({ title: "HW1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the class doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("creates homework and notifies enrolled students", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockHomeworkCreate.mockResolvedValue({ id: "hw1" });
    mockStudentFindMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    expect(mockCreateNotificationsForUserIds).toHaveBeenCalledWith(
      ["u1", "u2"],
      "HOMEWORK",
      expect.any(String),
      expect.any(String)
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
