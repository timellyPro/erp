/**
 * @jest-environment node
 */
import { POST } from "@/app/api/communication/appointments/[id]/reject/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    appointment: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

function makeRequest() {
  return new Request("http://localhost/api/communication/appointments/a1/reject", { method: "POST" });
}

const params = { id: "a1" };

describe("POST /api/communication/appointments/[id]/reject", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the appointment doesn't exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller isn't the assigned teacher", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t2", role: "TEACHER" } });
    mockFindUnique.mockResolvedValue({ id: "a1", teacherId: "t1", schoolId: "s1" });
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(403);
  });

  it("rejects the appointment", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "s1" } });
    mockFindUnique.mockResolvedValue({ id: "a1", teacherId: "t1", schoolId: "s1" });
    mockUpdate.mockResolvedValue({ id: "a1", status: "REJECTED" });
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "a1" }, data: { status: "REJECTED" } });
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "s1" } });
    mockFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(500);
  });
});
