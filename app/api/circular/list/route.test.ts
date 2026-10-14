/**
 * @jest-environment node
 */
import { GET } from "@/app/api/circular/list/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockUserUpdate = jest.fn();
const mockCircularFindMany = jest.fn();
const mockClassFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
  },
}));

// The route now reads circulars/classes through the app_tenant-connected,
// RLS-restricted client (docs/SECURITY_REVIEW.md) instead of the app's
// normal prisma import - simulate that transaction wrapper here, backed by
// the same mocks, so these tests still exercise the route's query-building
// logic without needing a real database connection.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      circular: { findMany: (...args: unknown[]) => mockCircularFindMany(...args) },
      class: { findMany: (...args: unknown[]) => mockClassFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/circular/list${query}`);
}

describe("GET /api/circular/list", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockUserUpdate.mockReset();
    mockCircularFindMany.mockReset();
    mockClassFindMany.mockReset();
    mockWithTenantScopedClient.mockClear();
    mockCircularFindMany.mockResolvedValue([]);
    mockClassFindMany.mockResolvedValue([]);
  });

  it("reads through the RLS-restricted app_tenant client, scoped to the session's own schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockWithTenantScopedClient).toHaveBeenCalledWith("s1", expect.any(Function));
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("resolves schoolId via admin lookup and backfills the user's schoolId for a SCHOOLADMIN", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue({ id: "s2" });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { schoolId: "s2" } });
  });

  it("filters by status and recipient", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockCircularFindMany.mockResolvedValue([{ id: "c1", classId: null }]);
    const res = await GET(makeRequest("?status=PUBLISHED&recipient=teachers"));
    expect(res.status).toBe(200);
    expect(mockCircularFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: "s1",
          publishStatus: "PUBLISHED",
          AND: [{ OR: [{ recipients: { has: "teachers" } }, { recipients: { has: "all" } }] }],
        }),
      })
    );
  });

  it("enriches circulars with target class info", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockCircularFindMany.mockResolvedValue([{ id: "c1", classId: "cl1" }]);
    mockClassFindMany.mockResolvedValue([{ id: "cl1", name: "Grade 5", section: "A" }]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.circulars[0].targetClass).toEqual({ id: "cl1", name: "Grade 5", section: "A" });
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockCircularFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
