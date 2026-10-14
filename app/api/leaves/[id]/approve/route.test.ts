/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/leaves/[id]/approve/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    leaveRequest: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

jest.mock("@/lib/notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/leaves/lv1/approve", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "lv1" });

describe("PATCH /api/leaves/[id]/approve", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockCreateNotification.mockReset();
    mockCreateNotification.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ type: "FULL" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot approve leave", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await PATCH(makeRequest({ type: "FULL" }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid approval type", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await PATCH(makeRequest({ type: "MAYBE" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when conditional approval has no remarks", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await PATCH(makeRequest({ type: "CONDITIONAL" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the leave request does not exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ type: "FULL" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when the leave belongs to a different school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockFindUnique.mockResolvedValue({ id: "lv1", status: "PENDING", schoolId: "s2" });
    const res = await PATCH(makeRequest({ type: "FULL" }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 409 when the leave is already decided", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockFindUnique.mockResolvedValue({ id: "lv1", status: "APPROVED", schoolId: "s1" });
    const res = await PATCH(makeRequest({ type: "FULL" }), { params });
    expect(res.status).toBe(409);
  });

  it("approves a pending leave and notifies the teacher", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockFindUnique.mockResolvedValue({ id: "lv1", status: "PENDING", schoolId: "s1" });
    mockUpdate.mockResolvedValue({ id: "lv1", status: "APPROVED", teacherId: "t1" });
    const res = await PATCH(makeRequest({ type: "FULL" }), { params });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", approverId: "u1" }) })
    );
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH(makeRequest({ type: "FULL" }), { params });
    expect(res.status).toBe(500);
  });
});
