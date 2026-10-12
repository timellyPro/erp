/**
 * @jest-environment node
 */
import { POST } from "@/app/api/tc/[id]/reject/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockTcFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    transferCertificate: {
      findFirst: (...args: unknown[]) => mockTcFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

jest.mock("@/lib/notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

function makeRequest() {
  return new Request("http://localhost/api/tc/tc1/reject", { method: "POST" });
}

const params = Promise.resolve({ id: "tc1" });

describe("POST /api/tc/[id]/reject", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockTcFindFirst.mockReset();
    mockUpdate.mockReset();
    mockCreateNotification.mockReset();
    mockCreateNotification.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the TC doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTcFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when the TC is not pending", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTcFindFirst.mockResolvedValue({ id: "tc1", status: "REJECTED", student: { userId: "stu1" } });
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(400);
  });

  it("rejects a pending TC and notifies the student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTcFindFirst.mockResolvedValue({ id: "tc1", status: "PENDING", student: { userId: "stu1" } });
    mockUpdate.mockResolvedValue({ id: "tc1", status: "REJECTED" });
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED", approvedById: "u1" }) })
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "stu1",
      "CERTIFICATES",
      expect.any(String),
      expect.any(String)
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTcFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(500);
  });
});
