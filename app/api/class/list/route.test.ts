/**
 * @jest-environment node
 */
import { GET } from "@/app/api/class/list/route";

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
    user: { update: (...args: unknown[]) => mockUpdate(...args), findUnique: jest.fn() },
    class: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    school: { findFirst: jest.fn() },
  },
}));

// Class reads now go through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md) instead of the app's normal prisma import.
const mockWithTenantScopedClient = jest.fn(async (_schoolId: string, fn: (tx: unknown) => unknown) =>
  fn({ class: { findMany: (...args: unknown[]) => mockFindMany(...args) } })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

const request = () => new Request("http://localhost/api/class/list");

describe("GET /api/class/list", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindMany.mockReset();
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
    mockWithTenantScopedClient.mockClear();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when no schoolId in session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockFindFirst.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe("School not found");
  });

  it("returns classes when session has schoolId", async () => {
    const classes = [
      { id: "c1", name: "Class 1", section: "A", schoolId: "s1", teacherId: null, teacher: null, _count: { students: 10 } },
    ];
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockFindMany.mockResolvedValue(classes);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.classes).toHaveLength(1);
    expect(json.classes[0].name).toBe("Class 1");
    expect(mockFindMany).toHaveBeenCalled();
    expect(mockWithTenantScopedClient).toHaveBeenCalledWith("s1", expect.any(Function));
  });
});
