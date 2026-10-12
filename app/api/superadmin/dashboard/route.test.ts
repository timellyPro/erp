/**
 * @jest-environment node
 */
import { GET } from "@/app/api/superadmin/dashboard/route";

const mockGetServerSession = jest.fn();
const mockSchoolCount = jest.fn();
const mockStudentCount = jest.fn();
const mockSchoolFindMany = jest.fn();
const mockPaymentFindMany = jest.fn();
const mockUserCount = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: {
      count: (...args: unknown[]) => mockSchoolCount(...args),
      findMany: (...args: unknown[]) => mockSchoolFindMany(...args),
    },
    student: { count: (...args: unknown[]) => mockStudentCount(...args) },
    payment: { findMany: (...args: unknown[]) => mockPaymentFindMany(...args) },
    user: { count: (...args: unknown[]) => mockUserCount(...args) },
  },
}));

describe("GET /api/superadmin/dashboard", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolCount.mockReset();
    mockStudentCount.mockReset();
    mockSchoolFindMany.mockReset();
    mockPaymentFindMany.mockReset();
    mockUserCount.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-superadmin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("aggregates schools, stats, and fee transactions", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolCount.mockResolvedValue(5);
    mockStudentCount.mockResolvedValue(200);
    mockUserCount.mockResolvedValue(30);
    mockSchoolFindMany.mockResolvedValue([
      {
        id: "s1",
        name: "Greenwood",
        location: "City",
        admins: [{ photoUrl: "https://x/p.png" }],
        _count: { students: 100, teachers: 10, classes: 5 },
      },
    ]);
    mockPaymentFindMany.mockResolvedValue([
      {
        id: "p1",
        amount: 500,
        createdAt: new Date(),
        student: { user: { name: "Alice" }, school: { id: "s1", name: "Greenwood" } },
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats.totalSchools).toBe(5);
    expect(json.schools[0].studentCount).toBe(100);
    expect(json.feeTransactions).toHaveLength(1);
  });

  it("skips payments whose student/school is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolCount.mockResolvedValue(0);
    mockStudentCount.mockResolvedValue(0);
    mockUserCount.mockResolvedValue(0);
    mockSchoolFindMany.mockResolvedValue([]);
    mockPaymentFindMany.mockResolvedValue([{ id: "p1", amount: 500, createdAt: new Date(), student: null }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.feeTransactions).toHaveLength(0);
  });

  it("returns 503 for a database connection error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolCount.mockRejectedValue({ code: "P1001", message: "Can't reach database server" });
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("returns 500 for a generic error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolCount.mockRejectedValue(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
