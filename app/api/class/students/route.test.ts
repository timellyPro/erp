/**
 * @jest-environment node
 */
import { GET } from "@/app/api/class/students/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockClassFindFirst = jest.fn();
const mockStudentFindMany = jest.fn();

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
      class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
      student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/class/students${query}`);
}

describe("GET /api/class/students", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockClassFindFirst.mockReset();
    mockStudentFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 404 when the given classId doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("?classId=c1"));
    expect(res.status).toBe(404);
  });

  it("returns students scoped to the class when classId is valid", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentFindMany.mockResolvedValue([{ id: "st1" }]);
    const res = await GET(makeRequest("?classId=c1"));
    expect(res.status).toBe(200);
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ schoolId: "s1", classId: "c1" }) })
    );
  });

  it("returns all school students when no classId is given", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const callArgs = mockStudentFindMany.mock.calls[0][0];
    expect(callArgs.where.classId).toBeUndefined();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
