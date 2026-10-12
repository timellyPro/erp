/**
 * @jest-environment node
 */
import { GET } from "@/app/api/student/list/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockRequireSchoolId = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockStudentFindMany = jest.fn();
const mockStudentCount = jest.fn();
const mockGetSchoolDashboardServerCached = jest.fn();
const mockSetSchoolDashboardServerCached = jest.fn();
const mockTenantCacheKey = jest.fn();
const mockSwrGet = jest.fn();
const mockSwrSet = jest.fn();
const mockResolveStudentDisplayClass = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/auth/tenant", () => ({
  requireSchoolId: (...args: unknown[]) => mockRequireSchoolId(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  getSchoolDashboardServerCached: (...args: unknown[]) => mockGetSchoolDashboardServerCached(...args),
  setSchoolDashboardServerCached: (...args: unknown[]) => mockSetSchoolDashboardServerCached(...args),
}));

jest.mock("@/lib/cache/tenantCache", () => ({
  tenantCacheKey: (...args: unknown[]) => mockTenantCacheKey(...args),
  swrGet: (...args: unknown[]) => mockSwrGet(...args),
  swrSet: (...args: unknown[]) => mockSwrSet(...args),
}));

jest.mock("@/lib/students/resolveStudentDisplayClass", () => ({
  resolveStudentDisplayClass: (...args: unknown[]) => mockResolveStudentDisplayClass(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: {
      findUnique: (...args: unknown[]) => mockStudentFindUnique(...args),
      findMany: (...args: unknown[]) => mockStudentFindMany(...args),
      count: (...args: unknown[]) => mockStudentCount(...args),
    },
  },
}));

const request = (query = "") => new Request(`http://localhost/api/student/list${query}`);

const session = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("GET /api/student/list", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockRequireSchoolId.mockReset().mockResolvedValue({ ok: true, schoolId: "s1" });
    mockStudentFindUnique.mockReset();
    mockStudentFindMany.mockReset().mockResolvedValue([]);
    mockStudentCount.mockReset().mockResolvedValue(0);
    mockGetSchoolDashboardServerCached.mockReset().mockReturnValue(null);
    mockSetSchoolDashboardServerCached.mockReset();
    mockTenantCacheKey.mockReset().mockResolvedValue("count-key-1");
    mockSwrGet.mockReset().mockResolvedValue(null);
    mockSwrSet.mockReset();
    mockResolveStudentDisplayClass.mockReset().mockImplementation((c) => c);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns the requireSchoolId error status when it fails", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockRequireSchoolId.mockResolvedValue({ ok: false, status: 403, message: "Forbidden" });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns 403 when the school is paused", async () => {
    mockGetServerSession.mockResolvedValue({ ...session, user: { ...session.user, schoolIsActive: false } });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns a cached page without querying the database", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockGetSchoolDashboardServerCached.mockReturnValue({ students: [{ id: "cached" }], items: [], nextCursor: null });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.students).toEqual([{ id: "cached" }]);
    expect(mockStudentFindMany).not.toHaveBeenCalled();
  });

  it("returns an empty result when studentId does not belong to the school", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindUnique.mockResolvedValue({ id: "stu1", schoolId: "other-school" });
    const res = await GET(request("?studentId=stu1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.students).toEqual([]);
  });

  it("returns the single student by studentId when it belongs to the school", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindUnique.mockResolvedValue({
      id: "stu1",
      schoolId: "s1",
      class: { id: "c1", name: "5", section: "A" },
      application: null,
    });
    const res = await GET(request("?studentId=stu1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.students[0].id).toBe("stu1");
    expect(json.students[0]).not.toHaveProperty("schoolId");
  });

  it("paginates and reports nextCursor when more rows exist", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindMany.mockResolvedValue([
      { id: "stu1", class: null, application: null },
      { id: "stu2", class: null, application: null },
    ]);
    const res = await GET(request("?take=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.nextCursor).toBe("stu1");
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, where: expect.objectContaining({ schoolId: "s1" }) })
    );
  });

  it("builds a case-insensitive OR search across identifiers and name/email for a non-numeric query", async () => {
    mockGetServerSession.mockResolvedValue(session);
    await GET(request("?q=jane"));
    const callArgs = mockStudentFindMany.mock.calls[0][0];
    expect(callArgs.where.OR).toEqual(
      expect.arrayContaining([{ user: { name: { contains: "jane", mode: "insensitive" } } }])
    );
  });

  it("skips the name/email join for a numeric admission/roll-like query in search mode", async () => {
    mockGetServerSession.mockResolvedValue(session);
    await GET(request("?q=123&search=1"));
    const callArgs = mockStudentFindMany.mock.calls[0][0];
    expect(callArgs.where.OR).not.toEqual(
      expect.arrayContaining([{ user: { name: expect.anything() } }])
    );
    expect(callArgs.where.OR).toEqual(
      expect.arrayContaining([{ admissionNumber: { contains: "123", mode: "insensitive" } }])
    );
  });

  it("treats a cuid-shaped query as an exact id lookup in search mode", async () => {
    mockGetServerSession.mockResolvedValue(session);
    const cuid = "c" + "a".repeat(24);
    await GET(request(`?q=${cuid}&search=1`));
    const callArgs = mockStudentFindMany.mock.calls[0][0];
    expect(callArgs.where.id).toBe(cuid);
  });

  it("filters by classId when provided", async () => {
    mockGetServerSession.mockResolvedValue(session);
    await GET(request("?classId=c1"));
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ classId: "c1" }) })
    );
  });

  it("includes an active-only total count when includeTotal=1 and there's no cursor", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentCount.mockResolvedValue(42);
    const res = await GET(request("?includeTotal=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(42);
    expect(mockStudentCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "Active" }) })
    );
  });

  it("uses a fresh cached count instead of recomputing when available", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockSwrGet.mockResolvedValue({ value: { total: 99 }, freshUntil: Date.now() + 60_000 });
    const res = await GET(request("?includeTotal=1"));
    const json = await res.json();
    expect(json.total).toBe(99);
    expect(mockStudentCount).not.toHaveBeenCalled();
  });

  it("does not cache the page when renderAll (all=1) is requested", async () => {
    mockGetServerSession.mockResolvedValue(session);
    const res = await GET(request("?all=1"));
    expect(res.status).toBe(200);
    expect(mockSetSchoolDashboardServerCached).not.toHaveBeenCalled();
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
