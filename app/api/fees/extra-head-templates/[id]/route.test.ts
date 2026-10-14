/**
 * @jest-environment node
 */
import { PATCH, DELETE } from "@/app/api/fees/extra-head-templates/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolIdForSession = jest.fn();
const mockTemplateFindFirst = jest.fn();
const mockTemplateUpdate = jest.fn();
const mockTemplateDeleteMany = jest.fn();
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
      findFirst: (...args: unknown[]) => mockTemplateFindFirst(...args),
      update: (...args: unknown[]) => mockTemplateUpdate(...args),
      deleteMany: (...args: unknown[]) => mockTemplateDeleteMany(...args),
    },
  },
}));

const ctx = { params: Promise.resolve({ id: "t1" }) };

const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/fees/extra-head-templates/t1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
const deleteRequest = () =>
  new Request("http://localhost/api/fees/extra-head-templates/t1", { method: "DELETE" });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const existingTemplate = {
  id: "t1",
  schoolId: "s1",
  name: "Sports",
  amount: 500,
  splitIntoTwoInstallments: false,
};

describe("PATCH /api/fees/extra-head-templates/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolIdForSession.mockReset();
    mockTemplateFindFirst.mockReset();
    mockTemplateUpdate.mockReset();
    mockInvalidateAssignCatalogServerCache.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ name: "New" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await PATCH(patchRequest({ name: "New" }), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ name: "New" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the template does not belong to the school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockTemplateFindFirst.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ name: "New" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when the resulting amount is invalid", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockTemplateFindFirst.mockResolvedValue(existingTemplate);
    const res = await PATCH(patchRequest({ amount: -5 }), ctx);
    expect(res.status).toBe(400);
  });

  it("updates only the provided fields, defaulting the rest from the existing record", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockTemplateFindFirst.mockResolvedValue(existingTemplate);
    mockTemplateUpdate.mockResolvedValue({ ...existingTemplate, amount: 750 });

    const res = await PATCH(patchRequest({ amount: 750 }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.template.amount).toBe(750);
    expect(mockTemplateUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { name: "Sports", amount: 750, splitIntoTwoInstallments: false },
    });
    expect(mockInvalidateAssignCatalogServerCache).toHaveBeenCalledWith("s1");
  });
});

describe("DELETE /api/fees/extra-head-templates/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolIdForSession.mockReset();
    mockTemplateDeleteMany.mockReset();
    mockInvalidateAssignCatalogServerCache.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when nothing matched the school-scoped delete", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockTemplateDeleteMany.mockResolvedValue({ count: 0 });
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes the template and invalidates the assign-catalog cache", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockTemplateDeleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockTemplateDeleteMany).toHaveBeenCalledWith({ where: { id: "t1", schoolId: "s1" } });
    expect(mockInvalidateAssignCatalogServerCache).toHaveBeenCalledWith("s1");
  });
});
