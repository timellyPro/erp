/**
 * @jest-environment node
 */
import { GET as GETImpl } from "@/app/api/student/credentials/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const GET = (req: Request) => GETImpl(req) as Promise<Response>;

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockComputeStudentCredentials = jest.fn();
const mockIsRedisEnabled = jest.fn();
const mockTenantCacheKey = jest.fn();
const mockSwrGet = jest.fn();
const mockSwrSet = jest.fn();
const mockGetSchoolDashboardServerCached = jest.fn();
const mockSetSchoolDashboardServerCached = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/students/computeStudentCredentials", () => ({
  computeStudentCredentials: (...args: unknown[]) => mockComputeStudentCredentials(...args),
}));

jest.mock("@/lib/cache/redis", () => ({
  isRedisEnabled: (...args: unknown[]) => mockIsRedisEnabled(...args),
}));

jest.mock("@/lib/cache/tenantCache", () => ({
  tenantCacheKey: (...args: unknown[]) => mockTenantCacheKey(...args),
  swrGet: (...args: unknown[]) => mockSwrGet(...args),
  swrSet: (...args: unknown[]) => mockSwrSet(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  getSchoolDashboardServerCached: (...args: unknown[]) => mockGetSchoolDashboardServerCached(...args),
  setSchoolDashboardServerCached: (...args: unknown[]) => mockSetSchoolDashboardServerCached(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
  },
}));

const request = (query = "") => new Request(`http://localhost/api/student/credentials${query}`);

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const studentRow = {
  name: "Student One",
  email: "s1@school.com",
  password: "abc123",
  passwordVerified: true,
  dob: "2010-01-01",
  className: "5",
  section: "A",
  admissionNumber: "A1",
  rollNo: "01",
  accountActive: true,
};

const payload = { students: [studentRow] };

describe("GET /api/student/credentials", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockComputeStudentCredentials.mockReset().mockResolvedValue(payload);
    mockIsRedisEnabled.mockReset().mockReturnValue(false);
    mockTenantCacheKey.mockReset();
    mockSwrGet.mockReset();
    mockSwrSet.mockReset();
    mockGetSchoolDashboardServerCached.mockReset().mockReturnValue(null);
    mockSetSchoolDashboardServerCached.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns 403 when the school is paused", async () => {
    mockGetServerSession.mockResolvedValue({ ...adminSession, user: { ...adminSession.user, schoolIsActive: false } });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns a mem-cached payload without recomputing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSchoolDashboardServerCached.mockReturnValue({ students: [{ ...studentRow, name: "Cached" }] });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.students[0].name).toBe("Cached");
    expect(mockComputeStudentCredentials).not.toHaveBeenCalled();
  });

  it("returns the JSON payload as-is by default", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(payload);
  });

  it("filters to verified+active rows and returns counts when verifiedOnly=1", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockComputeStudentCredentials.mockResolvedValue({
      students: [
        studentRow,
        { ...studentRow, name: "Unverified", passwordVerified: false, accountActive: true },
      ],
    });
    const res = await GET(request("?verifiedOnly=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(1);
    expect(json.verifiedCount).toBe(1);
    expect(json.mismatchCount).toBe(0);
  });

  it("returns an xlsx attachment when format=xlsx", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await GET(request("?format=xlsx"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("Content-Disposition")).toContain("student-credentials-all.xlsx");
  });

  it("returns a csv attachment named 'filtered' when a filter is applied", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await GET(request("?format=csv&classId=c1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("student-credentials-filtered.csv");
  });

  it("masks the password for unverified rows in exports", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockComputeStudentCredentials.mockResolvedValue({
      students: [{ ...studentRow, passwordVerified: false, password: "secret" }],
    });
    const res = await GET(request("?format=csv"));
    const text = await res.text();
    expect(text).not.toContain("secret");
    expect(text).toContain("No — reset required");
  });

  it("uses the Redis SWR cache when enabled and fresh", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockIsRedisEnabled.mockReturnValue(true);
    mockTenantCacheKey.mockResolvedValue("redis-key-1");
    mockSwrGet.mockResolvedValue({ value: { students: [{ ...studentRow, name: "FromRedis" }] }, freshUntil: Date.now() + 60_000 });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.students[0].name).toBe("FromRedis");
    expect(mockComputeStudentCredentials).not.toHaveBeenCalled();
  });

  it("returns 404 when the computed error mentions a missing class", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockComputeStudentCredentials.mockRejectedValue(new Error("Class not found"));
    const res = await GET(request());
    expect(res.status).toBe(404);
  });

  it("returns 500 for an unrelated error", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockComputeStudentCredentials.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
