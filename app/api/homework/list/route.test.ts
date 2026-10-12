/**
 * @jest-environment node
 */
import { GET } from "@/app/api/homework/list/route";

const mockGetServerSession = jest.fn();
const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockFindUnique = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    student: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  },
}));

// Homework reads now go through the app_tenant-connected, RLS-restricted
// client (docs/SECURITY_REVIEW.md) instead of the app's normal prisma import.
const mockWithTenantScopedClient = jest.fn(async (_schoolId: string, fn: (tx: unknown) => unknown) =>
  fn({ homework: { findMany: (...args: unknown[]) => mockFindMany(...args) } })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

describe("GET /api/homework/list", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindMany.mockReset();
    mockFindFirst.mockReset();
    mockFindUnique.mockReset();
    mockWithTenantScopedClient.mockClear();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = new Request("http://localhost/api/homework/list");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockFindFirst.mockResolvedValue(null);
    const req = new Request("http://localhost/api/homework/list");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe("School not found in session");
  });

  it("returns homeworks when session has schoolId", async () => {
    const homeworks = [
      {
        id: "h1",
        title: "Math HW",
        schoolId: "s1",
        classId: "c1",
        subject: "Math",
        createdAt: new Date(),
        class: { id: "c1", name: "10", section: "A", _count: { students: 30 } },
        teacher: { id: "t1", name: "T1", email: "t@x.com" },
        _count: { submissions: 5 },
      },
    ];
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockFindMany.mockResolvedValue(homeworks);
    const req = new Request("http://localhost/api/homework/list");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.homeworks).toHaveLength(1);
    expect(json.homeworks[0].title).toBe("Math HW");
    expect(mockWithTenantScopedClient).toHaveBeenCalledWith("s1", expect.any(Function));
  });
});
