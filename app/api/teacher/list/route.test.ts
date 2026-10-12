/**
 * @jest-environment node
 */
import { GET } from "@/app/api/teacher/list/route";

const mockGetServerSession = jest.fn();
const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: {
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    school: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    student: { findUnique: jest.fn() },
  },
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      user: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

describe("GET /api/teacher/list", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindMany.mockReset();
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.json()).resolves.toMatchObject({ message: "Unauthorized" });
  });

  it("returns teachers when session has schoolId", async () => {
    const teachers = [
      { id: "t1", name: "Teacher 1", email: "t1@school.com", mobile: null, teacherId: null, subject: null, photoUrl: null },
    ];
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockFindMany.mockResolvedValue(teachers);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.teachers).toHaveLength(1);
    expect(json.teachers[0].name).toBe("Teacher 1");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "s1", role: "TEACHER" },
      })
    );
  });

  it("returns 400 when no schoolId in session and admin school not found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockFindFirst.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe("School not found in session");
  });
});
