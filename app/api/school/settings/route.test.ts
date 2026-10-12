/**
 * @jest-environment node
 */
import { GET, PUT } from "@/app/api/school/settings/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockSettingsFindUnique = jest.fn();
const mockSettingsCreate = jest.fn();
const mockSettingsUpsert = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    schoolSettings: {
      upsert: (...args: unknown[]) => mockSettingsUpsert(...args),
    },
  },
}));

// GET's read-or-create goes through the app_tenant-connected,
// RLS-restricted client (docs/SECURITY_REVIEW.md); PUT still uses the
// plain prisma import.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      schoolSettings: {
        findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
        create: (...args: unknown[]) => mockSettingsCreate(...args),
      },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/school/settings", { method: "PUT", body: JSON.stringify(body) });
}

describe("GET /api/school/settings", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockSettingsFindUnique.mockReset();
    mockSettingsCreate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("creates default settings when none exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockSettingsFindUnique.mockResolvedValue(null);
    mockSettingsCreate.mockResolvedValue({ schoolId: "s1", admissionPrefix: "ADM" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockSettingsCreate).toHaveBeenCalled();
  });

  it("returns existing settings", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockSettingsFindUnique.mockResolvedValue({ schoolId: "s1", admissionPrefix: "GW" });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.settings.admissionPrefix).toBe("GW");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockSettingsFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/school/settings", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSettingsUpsert.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(makePutRequest({}));
    expect(res.status).toBe(401);
  });

  it("upserts the settings and clears hyperpg fields when given empty strings", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockSettingsUpsert.mockResolvedValue({ schoolId: "s1" });
    const res = await PUT(
      makePutRequest({ admissionPrefix: "GW", hyperpgMerchantId: "", hyperpgApiKey: "" })
    );
    expect(res.status).toBe(200);
    expect(mockSettingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ admissionPrefix: "GW", hyperpgMerchantId: null, hyperpgApiKey: null }),
      })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockSettingsUpsert.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(makePutRequest({ admissionPrefix: "GW" }));
    expect(res.status).toBe(500);
  });
});
