/**
 * @jest-environment node
 */
import { PUT, DELETE } from "@/app/api/leaves/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    leaveRequest: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/leaves/lv1", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "lv1" });

describe("PUT /api/leaves/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindUnique.mockReset();
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(makeRequest({}), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the leave request does not exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockFindUnique.mockResolvedValue(null);
    const res = await PUT(makeRequest({ fromDate: "2026-01-01", toDate: "2026-01-02" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when updating someone else's leave", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockFindUnique.mockResolvedValue({ id: "lv1", teacherId: "other", status: "PENDING" });
    const res = await PUT(makeRequest({ fromDate: "2026-01-01", toDate: "2026-01-02" }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 409 when the leave is no longer pending", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockFindUnique.mockResolvedValue({ id: "lv1", teacherId: "t1", status: "APPROVED" });
    const res = await PUT(makeRequest({ fromDate: "2026-01-01", toDate: "2026-01-02" }), { params });
    expect(res.status).toBe(409);
  });

  it("updates the leave and returns 200", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockFindUnique.mockResolvedValue({ id: "lv1", teacherId: "t1", status: "PENDING" });
    mockFindFirst.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ id: "lv1", status: "PENDING" });
    const res = await PUT(
      makeRequest({ fromDate: "2026-01-01", toDate: "2026-01-02", reason: "updated" }),
      { params }
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(makeRequest({ fromDate: "2026-01-01", toDate: "2026-01-02" }), { params });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/leaves/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindUnique.mockReset();
    mockDelete.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(makeRequest({}), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the leave request does not exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockFindUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest({}), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when deleting someone else's leave", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockFindUnique.mockResolvedValue({ id: "lv1", teacherId: "other", status: "PENDING" });
    const res = await DELETE(makeRequest({}), { params });
    expect(res.status).toBe(403);
  });

  it("returns 409 when the leave is no longer pending", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockFindUnique.mockResolvedValue({ id: "lv1", teacherId: "t1", status: "APPROVED" });
    const res = await DELETE(makeRequest({}), { params });
    expect(res.status).toBe(409);
  });

  it("deletes the leave and returns success", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockFindUnique.mockResolvedValue({ id: "lv1", teacherId: "t1", status: "PENDING" });
    mockDelete.mockResolvedValue({ id: "lv1" });
    const res = await DELETE(makeRequest({}), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true });
  });
});
