/**
 * @jest-environment node
 */
import { GET } from "@/app/api/superadmin/schools/route";

const mockGetServerSession = jest.fn();
const mockFindMany = jest.fn();
const mockPaymentFindMany = jest.fn();
const mockPaymentCount = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    payment: {
      findMany: (...args: unknown[]) => mockPaymentFindMany(...args),
      count: (...args: unknown[]) => mockPaymentCount(...args),
    },
  },
}));

describe("GET /api/superadmin/schools (multi-tenant)", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindMany.mockReset();
    mockPaymentFindMany.mockReset();
    mockPaymentCount.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = new Request("http://localhost/api/superadmin/schools");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not SUPERADMIN", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SCHOOLADMIN" },
    });
    const req = new Request("http://localhost/api/superadmin/schools");
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns list of all schools for SUPERADMIN (multi-tenant access)", async () => {
    const schools = [
      {
        id: "s1",
        name: "School A",
        address: "Addr A",
        location: "Loc A",
        createdAt: new Date(),
        _count: { students: 100, teachers: 10, classes: 5 },
        admins: [{ id: "a1", name: "Admin A", email: "a@a.com", mobile: null, role: "SCHOOLADMIN" }],
      },
      {
        id: "s2",
        name: "School B",
        address: "Addr B",
        location: "Loc B",
        createdAt: new Date(),
        _count: { students: 50, teachers: 5, classes: 3 },
        admins: [{ id: "a2", name: "Admin B", email: "b@b.com", mobile: null, role: "SCHOOLADMIN" }],
      },
    ];
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SUPERADMIN" },
    });
    mockFindMany.mockResolvedValue(schools);
    mockPaymentFindMany.mockResolvedValue([]);
    mockPaymentCount.mockResolvedValue(0);

    const req = new Request("http://localhost/api/superadmin/schools");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.schools).toHaveLength(2);
    expect(json.schools[0].name).toBe("School A");
    expect(json.schools[0].studentCount).toBe(100);
    expect(json.schools[0].admin).toBeDefined();
    expect(json.schools[1].name).toBe("School B");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("filters schools by search query", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SUPERADMIN" },
    });
    mockFindMany.mockResolvedValue([]);
    mockPaymentFindMany.mockResolvedValue([]);
    mockPaymentCount.mockResolvedValue(0);

    const req = new Request("http://localhost/api/superadmin/schools?search=First");
    await GET(req);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: "First", mode: "insensitive" } },
      })
    );
  });
});
