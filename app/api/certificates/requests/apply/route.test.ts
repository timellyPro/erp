/**
 * @jest-environment node
 */
import { POST } from "@/app/api/certificates/requests/apply/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockGetClassStaffNotifyUserIds = jest.fn();
const mockCreateNotificationsForUserIds = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: {
      findFirst: (...args: unknown[]) => mockStudentFindFirst(...args),
      findUnique: (...args: unknown[]) => mockStudentFindUnique(...args),
    },
    transferCertificate: { create: (...args: unknown[]) => mockCreate(...args) },
  },
}));

jest.mock("@/lib/notificationService", () => ({
  getClassStaffNotifyUserIds: (...args: unknown[]) => mockGetClassStaffNotifyUserIds(...args),
  createNotificationsForUserIds: (...args: unknown[]) => mockCreateNotificationsForUserIds(...args),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/certificates/requests/apply", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const createdRequest = {
  id: "req1",
  student: {
    user: { id: "stu-user1", name: "Alice" },
    class: { id: "c1", teacherId: "t1" },
  },
};

describe("POST /api/certificates/requests/apply", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindFirst.mockReset();
    mockStudentFindUnique.mockReset();
    mockCreate.mockReset();
    mockGetClassStaffNotifyUserIds.mockReset();
    mockCreateNotificationsForUserIds.mockReset();
    mockGetClassStaffNotifyUserIds.mockResolvedValue([]);
    mockCreateNotificationsForUserIds.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no student can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    mockStudentFindUnique.mockResolvedValue({ schoolId: null });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("creates the certificate request and notifies class staff", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockCreate.mockResolvedValue(createdRequest);
    mockGetClassStaffNotifyUserIds.mockResolvedValue(["t1"]);
    const res = await POST(makeRequest({ reason: "need it" }));
    expect(res.status).toBe(201);
    expect(mockCreateNotificationsForUserIds).toHaveBeenCalledWith(
      ["t1"],
      "CERTIFICATES",
      expect.any(String),
      expect.any(String)
    );
  });

  it("still succeeds when the notification step fails", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockCreate.mockResolvedValue(createdRequest);
    mockGetClassStaffNotifyUserIds.mockRejectedValue(new Error("notify failed"));
    const res = await POST(makeRequest({ reason: "need it" }));
    expect(res.status).toBe(201);
  });

  it("maps a Prisma P2022 error to a schema-update message", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockCreate.mockRejectedValue({ code: "P2022" });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toMatch(/schema/i);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    const req = new Request("http://localhost/api/certificates/requests/apply", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
