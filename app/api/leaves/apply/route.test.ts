/**
 * @jest-environment node
 */
import { POST } from "@/app/api/leaves/apply/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockCreate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    leaveRequest: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/leaves/apply", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/leaves/apply", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindUnique.mockReset();
    mockFindFirst.mockReset();
    mockCreate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    const res = await POST(makeRequest({ leaveType: "SICK" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date range", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    const res = await POST(
      makeRequest({ leaveType: "SICK", fromDate: "2026-01-10", toDate: "2026-01-01" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when an overlapping leave already exists", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockFindFirst.mockResolvedValue({ id: "existing" });
    const res = await POST(
      makeRequest({ leaveType: "SICK", fromDate: "2026-01-01", toDate: "2026-01-02" })
    );
    expect(res.status).toBe(409);
  });

  it("creates the leave request and returns 201", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "lv1" });
    const res = await POST(
      makeRequest({ leaveType: "SICK", reason: "flu", fromDate: "2026-01-01", toDate: "2026-01-02" })
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teacherId: "t1", schoolId: "s1", leaveType: "SICK" }),
      })
    );
  });

  it("resolves schoolId from teacherSchools when session lacks one", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockFindUnique.mockResolvedValue({
      schoolId: null,
      teacherSchools: [{ id: "s2" }],
      assignedClasses: [],
    });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "lv2" });
    const res = await POST(
      makeRequest({ leaveType: "SICK", fromDate: "2026-01-01", toDate: "2026-01-02" })
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ schoolId: "s2" }) })
    );
  });

  it("returns 400 when no school can be resolved for a teacher", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockFindUnique.mockResolvedValue({ schoolId: null, teacherSchools: [], assignedClasses: [] });
    const res = await POST(
      makeRequest({ leaveType: "SICK", fromDate: "2026-01-01", toDate: "2026-01-02" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(
      makeRequest({ leaveType: "SICK", fromDate: "2026-01-01", toDate: "2026-01-02" })
    );
    expect(res.status).toBe(500);
  });
});
