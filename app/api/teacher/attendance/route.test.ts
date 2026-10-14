/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/teacher/attendance/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockQueryRawUnsafe = jest.fn();
const mockExecuteRawUnsafe = jest.fn();
const mockUserFindMany = jest.fn();
const mockGetCached = jest.fn();
const mockSetCached = jest.fn();
const mockPurgeCache = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
  },
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  getSchoolDashboardServerCached: (...args: unknown[]) => mockGetCached(...args),
  setSchoolDashboardServerCached: (...args: unknown[]) => mockSetCached(...args),
  purgeSchoolDashboardServerCacheMatching: (...args: unknown[]) => mockPurgeCache(...args),
}));

function makeGetRequest(query = "") {
  return new Request(`http://localhost/api/teacher/attendance${query}`);
}
function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/teacher/attendance", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/teacher/attendance", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockQueryRawUnsafe.mockReset();
    mockGetCached.mockReset();
    mockSetCached.mockReset();
    mockGetCached.mockReturnValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest("?date=2026-01-10"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetRequest("?date=2026-01-10"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when date is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
  });

  it("returns a cached payload when present", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockGetCached.mockReturnValue({ attendances: [{ teacherId: "t1" }] });
    const res = await GET(makeGetRequest("?date=2026-01-10"));
    expect(res.status).toBe(200);
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it("queries and caches attendance rows on a miss", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockQueryRawUnsafe.mockResolvedValue([
      {
        teacherId: "t1",
        status: "PRESENT",
        date: "2026-01-10",
        teacher_id: "t1",
        teacher_name: "Jane",
        teacher_email: "jane@x.com",
        teacher_teacherId: "T1",
        teacher_subject: "Math",
      },
    ]);
    const res = await GET(makeGetRequest("?date=2026-01-10"));
    expect(res.status).toBe(200);
    expect(mockSetCached).toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockQueryRawUnsafe.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest("?date=2026-01-10"));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/teacher/attendance", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockExecuteRawUnsafe.mockReset();
    mockUserFindMany.mockReset();
    mockPurgeCache.mockReset();
    mockExecuteRawUnsafe.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without the required feature", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", allowedFeatures: [] } });
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(403);
  });

  it("returns 400 when date or attendances is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await POST(makePostRequest({ date: "2026-01-10" }));
    expect(res.status).toBe(400);
  });

  it("returns early with saved: 0 when there are no valid candidate rows", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await POST(makePostRequest({ date: "2026-01-10", attendances: [{ teacherId: "", status: "PRESENT" }] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saved).toBe(0);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("saves valid attendance rows and purges the cache", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindMany.mockResolvedValue([{ id: "t1" }]);
    const res = await POST(
      makePostRequest({ date: "2026-01-10", attendances: [{ teacherId: "t1", status: "PRESENT" }] })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saved).toBe(1);
    expect(mockPurgeCache).toHaveBeenCalledWith("teacher:attendance:s1");
  });

  it("allows a teacher with the TEACHER_LEAVES feature", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "t1", role: "TEACHER", schoolId: "s1", allowedFeatures: ["TEACHER_LEAVES"] },
    });
    mockUserFindMany.mockResolvedValue([{ id: "t1" }]);
    const res = await POST(
      makePostRequest({ date: "2026-01-10", attendances: [{ teacherId: "t1", status: "PRESENT" }] })
    );
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(
      makePostRequest({ date: "2026-01-10", attendances: [{ teacherId: "t1", status: "PRESENT" }] })
    );
    expect(res.status).toBe(500);
  });
});
