/**
 * @jest-environment node
 */
import { GET } from "@/app/api/teacher-audit/teachers/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockUserFindMany = jest.fn();
const mockGroupBy = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
  },
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
      teacherAuditRecord: { groupBy: (...args: unknown[]) => mockGroupBy(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/teacher-audit/teachers${query}`);
}

describe("GET /api/teacher-audit/teachers", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockUserFindMany.mockReset();
    mockGroupBy.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role/feature that lacks access", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER", schoolId: "s1", allowedFeatures: [] } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("computes performance scores from a baseline of 50", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindMany.mockResolvedValue([{ id: "t1", name: "Jane", email: "j@x.com" }]);
    mockGroupBy.mockResolvedValue([{ teacherId: "t1", _sum: { scoreImpact: 10 }, _count: { _all: 3 } }]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.teachers[0].performanceScore).toBe(60);
    expect(json.teachers[0].recordCount).toBe(3);
  });

  it("defaults to baseline score for teachers with no records", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindMany.mockResolvedValue([{ id: "t1", name: "Jane" }]);
    mockGroupBy.mockReturnValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.teachers[0].performanceScore).toBe(50);
  });

  it("allows a teacher with the TEACHER_AUDIT feature", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "t1", role: "TEACHER", schoolId: "s1", allowedFeatures: ["TEACHER_AUDIT"] },
    });
    mockUserFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockUserFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
