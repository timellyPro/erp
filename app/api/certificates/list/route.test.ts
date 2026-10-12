/**
 * @jest-environment node
 */
import { GET } from "@/app/api/certificates/list/route";

const mockGetServerSession = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockFindMany = jest.fn();

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
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
  },
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      certificate: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/certificates/list${query}`);
}

describe("GET /api/certificates/list", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindFirst.mockReset();
    mockStudentFindUnique.mockReset();
    mockSchoolFindFirst.mockReset();
    mockFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockStudentFindFirst.mockResolvedValue(null);
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("scopes to the session's own student certificates", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    mockFindMany.mockResolvedValue([{ id: "c1" }]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ schoolId: "s1", studentId: "st1" }) })
    );
  });

  it("resolves the linked student when session has no studentId (parent dashboard)", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockStudentFindFirst.mockResolvedValue({ id: "st2", schoolId: "s2" });
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ schoolId: "s2", studentId: "st2" }) })
    );
  });

  it("filters by studentId query param for staff", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("?studentId=st9"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentId: "st9" }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    mockFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
