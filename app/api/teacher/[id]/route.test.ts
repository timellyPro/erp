/**
 * @jest-environment node
 */
import { GET } from "@/app/api/teacher/[id]/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockUserUpdate = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({ user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) } })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest() {
  return new Request("http://localhost/api/teacher/t1") as unknown as import("next/server").NextRequest;
}
const params = Promise.resolve({ id: "t1" });

describe("GET /api/teacher/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockStudentFindUnique.mockReset();
    mockUserUpdate.mockReset();
    mockUserFindUnique.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    mockStudentFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the teacher doesn't exist or isn't a teacher", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockUserFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when the teacher belongs to a different school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockUserFindUnique.mockResolvedValue({ id: "t1", role: "TEACHER", schoolId: "s2" });
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(403);
  });

  it("returns the teacher", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockUserFindUnique.mockResolvedValue({ id: "t1", role: "TEACHER", schoolId: "s1", name: "Jane" });
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockUserFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(500);
  });
});
