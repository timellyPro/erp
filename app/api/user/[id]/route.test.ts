/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/user/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserUpdate = jest.fn();
const mockUserDelete = jest.fn();
const mockBcryptHash = jest.fn();
const mockPurgeSchoolDashboardServerCacheMatching = jest.fn();
const mockSanitizeTeachingClassIds = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("bcryptjs", () => ({
  hash: (...args: unknown[]) => mockBcryptHash(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  purgeSchoolDashboardServerCacheMatching: (...args: unknown[]) =>
    mockPurgeSchoolDashboardServerCacheMatching(...args),
}));

jest.mock("@/lib/teacher/teacherClassAccess", () => ({
  sanitizeTeachingClassIds: (...args: unknown[]) => mockSanitizeTeachingClassIds(...args),
}));

jest.mock("../../../../lib/db", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
      delete: (...args: unknown[]) => mockUserDelete(...args),
    },
  },
}));

// GET's read goes through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md) when the caller has a schoolId; PUT/DELETE and
// the schoolId-less GET fallback still use the plain prisma import.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

const ctx = { params: Promise.resolve({ id: "u2" }) };
const getRequest = () => new NextRequest("http://localhost/api/user/u2");
const putRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/user/u2", { method: "PUT", body: JSON.stringify(body) });
const deleteRequest = () => new NextRequest("http://localhost/api/user/u2", { method: "DELETE" });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("GET /api/user/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserFindUnique.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(getRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user does not exist", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue(null);
    const res = await GET(getRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user belongs to a different school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u2", schoolId: "other-school", teachingClassIds: [] });
    const res = await GET(getRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("maps the user, deriving designation and assignedClassIds", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({
      id: "u2",
      name: "Teacher One",
      subject: "Math",
      schoolId: "s1",
      teachingClassIds: ["c1", "", "c2"],
      assignedClasses: [{ id: "c1", name: "5", section: "A" }],
    });
    const res = await GET(getRequest(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.designation).toBe("Math");
    expect(json.assignedClassIds).toEqual(["c1", "c2"]);
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(getRequest(), ctx);
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/user/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserFindUnique.mockReset();
    mockUserUpdate.mockReset();
    mockBcryptHash.mockReset().mockResolvedValue("hashed-pw");
    mockPurgeSchoolDashboardServerCacheMatching.mockReset();
    mockSanitizeTeachingClassIds.mockReset().mockResolvedValue(["c1"]);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(putRequest({ name: "New" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the target user does not exist", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue(null);
    const res = await PUT(putRequest({ name: "New" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the target user belongs to a different school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u2", email: "u2@x.com", schoolId: "other-school", role: "TEACHER" });
    const res = await PUT(putRequest({ name: "New" }), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when the new email is already in use", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique
      .mockResolvedValueOnce({ id: "u2", email: "old@x.com", schoolId: "s1", role: "TEACHER" })
      .mockResolvedValueOnce({ id: "other" });
    const res = await PUT(putRequest({ email: "taken@x.com" }), ctx);
    expect(res.status).toBe(400);
  });

  it("updates basic fields and hashes a new password when provided", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u2", email: "old@x.com", schoolId: "s1", role: "STUDENT" });
    mockUserUpdate.mockResolvedValue({ id: "u2", name: "New Name", subject: null, teachingClassIds: null });

    const res = await PUT(putRequest({ name: "New Name", password: "newpw" }), ctx);
    expect(res.status).toBe(200);
    expect(mockBcryptHash).toHaveBeenCalledWith("newpw", 10);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u2" },
        data: { name: "New Name", password: "hashed-pw" },
      })
    );
  });

  it("does not apply teacher-specific fields to a non-teacher user", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u2", email: "old@x.com", schoolId: "s1", role: "STUDENT" });
    mockUserUpdate.mockResolvedValue({ id: "u2" });

    await PUT(putRequest({ qualification: "B.Ed", assignedClassIds: ["c1"] }), ctx);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} })
    );
    expect(mockSanitizeTeachingClassIds).not.toHaveBeenCalled();
  });

  it("sanitizes assignedClassIds and purges caches for a TEACHER update", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u2", email: "old@x.com", schoolId: "s1", role: "TEACHER" });
    mockUserUpdate.mockResolvedValue({ id: "u2", teachingClassIds: ["c1"] });

    const res = await PUT(putRequest({ assignedClassIds: ["c1", "bogus"] }), ctx);
    expect(res.status).toBe(200);
    expect(mockSanitizeTeachingClassIds).toHaveBeenCalledWith(["c1", "bogus"], "s1");
    expect(mockPurgeSchoolDashboardServerCacheMatching).toHaveBeenCalledWith("teacher:list:s1");
    expect(mockPurgeSchoolDashboardServerCacheMatching).toHaveBeenCalledWith("class:list:lite:s1");
  });

  it("parses a dd-mm-yyyy joiningDate for a TEACHER", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u2", email: "old@x.com", schoolId: "s1", role: "TEACHER" });
    mockUserUpdate.mockResolvedValue({ id: "u2" });

    await PUT(putRequest({ joiningDate: "15-06-2023" }), ctx);
    const updateCall = mockUserUpdate.mock.calls[0][0];
    expect(updateCall.data.joiningDate).toEqual(new Date(2023, 5, 15));
  });

  it("returns 500 when the update throws", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u2", email: "old@x.com", schoolId: "s1", role: "STUDENT" });
    mockUserUpdate.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(putRequest({ name: "New" }), ctx);
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/user/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserFindUnique.mockReset();
    mockUserDelete.mockReset();
    mockPurgeSchoolDashboardServerCacheMatching.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot delete users", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the target user does not exist", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the target user belongs to a different school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u2", schoolId: "other-school" });
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when trying to delete your own account", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u1", schoolId: "s1" });
    const res = await DELETE(new NextRequest("http://localhost/api/user/u1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "u1" }),
    });
    expect(res.status).toBe(400);
  });

  it("deletes the user and purges teacher caches when the user is a TEACHER", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u2", schoolId: "s1", role: "TEACHER" });
    mockUserDelete.mockResolvedValue({});

    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(200);
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "u2" } });
    expect(mockPurgeSchoolDashboardServerCacheMatching).toHaveBeenCalledWith("teacher:list:s1");
  });

  it("does not purge caches when deleting a non-teacher", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u2", schoolId: "s1", role: "STUDENT" });
    mockUserDelete.mockResolvedValue({});

    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(200);
    expect(mockPurgeSchoolDashboardServerCacheMatching).not.toHaveBeenCalled();
  });

  it("returns 500 when deletion throws", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "u2", schoolId: "s1", role: "STUDENT" });
    mockUserDelete.mockRejectedValue(new Error("DB exploded"));
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(500);
  });
});
