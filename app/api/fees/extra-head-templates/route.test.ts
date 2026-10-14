/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/fees/extra-head-templates/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolIdForSession = jest.fn();
const mockTemplateFindMany = jest.fn();
const mockTemplateCreate = jest.fn();
const mockInvalidateAssignCatalogServerCache = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/app/api/fees/extra-head-templates/resolveSchoolId", () => ({
  resolveFeesSchoolIdForSession: (...args: unknown[]) => mockResolveFeesSchoolIdForSession(...args),
}));

jest.mock("@/lib/fees/assignCatalogServerCache", () => ({
  invalidateAssignCatalogServerCache: (...args: unknown[]) => mockInvalidateAssignCatalogServerCache(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    extraFeeHeadTemplate: {
      create: (...args: unknown[]) => mockTemplateCreate(...args),
    },
  },
}));

// GET's list read now goes through the app_tenant-connected, RLS-restricted
// client (docs/SECURITY_REVIEW.md) instead of the app's normal prisma import.
const mockWithTenantScopedClient = jest.fn(async (_schoolId: string, fn: (tx: unknown) => unknown) =>
  fn({ extraFeeHeadTemplate: { findMany: (...args: unknown[]) => mockTemplateFindMany(...args) } })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

const postRequest = (body: unknown) =>
  new Request("http://localhost/api/fees/extra-head-templates", {
    method: "POST",
    body: JSON.stringify(body),
  });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("GET /api/fees/extra-head-templates", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolIdForSession.mockReset();
    mockTemplateFindMany.mockReset();
    mockWithTenantScopedClient.mockClear();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("returns the school's templates", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockTemplateFindMany.mockResolvedValue([{ id: "t1", name: "Sports", amount: 500 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.templates).toHaveLength(1);
    expect(mockTemplateFindMany).toHaveBeenCalledWith({
      where: { schoolId: "s1" },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    });
  });
});

describe("POST /api/fees/extra-head-templates", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolIdForSession.mockReset();
    mockTemplateCreate.mockReset();
    mockInvalidateAssignCatalogServerCache.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(postRequest({ name: "Sports", amount: 500 }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await POST(postRequest({ name: "Sports", amount: 500 }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for an empty name", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    const res = await POST(postRequest({ name: "  ", amount: 500 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-positive amount", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    const res = await POST(postRequest({ name: "Sports", amount: 0 }));
    expect(res.status).toBe(400);
  });

  it("creates the template and invalidates the assign-catalog cache", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockTemplateCreate.mockResolvedValue({ id: "t1", name: "Sports", amount: 500 });

    const res = await POST(postRequest({ name: "Sports", amount: 500, splitIntoTwoInstallments: true }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.template.id).toBe("t1");
    expect(mockTemplateCreate).toHaveBeenCalledWith({
      data: { schoolId: "s1", name: "Sports", amount: 500, splitIntoTwoInstallments: true },
    });
    expect(mockInvalidateAssignCatalogServerCache).toHaveBeenCalledWith("s1");
  });
});
