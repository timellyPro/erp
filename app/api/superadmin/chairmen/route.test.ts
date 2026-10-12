/**
 * @jest-environment node
 */
import { GET } from "@/app/api/superadmin/chairmen/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindMany = jest.fn();
const mockQueryRaw = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findMany: (...args: unknown[]) => mockSchoolFindMany(...args) },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

describe("GET /api/superadmin/chairmen", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindMany.mockReset();
    mockQueryRaw.mockReset();
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

  it("groups chairmen under their school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindMany.mockResolvedValue([{ id: "s1", name: "Greenwood", location: "City" }]);
    mockQueryRaw.mockResolvedValue([
      { id: "c1", name: "Chairman A", email: "a@x.com", mobile: null, role: "CHAIRMAN", schoolId: "s1", createdAt: new Date() },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.schools[0].users).toHaveLength(1);
  });

  it("returns 503 for a Prisma connection error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindMany.mockRejectedValue({ code: "P1001" });
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("returns 500 for a generic error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindMany.mockRejectedValue(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
