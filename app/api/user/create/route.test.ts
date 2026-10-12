/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/user/create/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindUnique = jest.fn();
const mockSchoolSettingsFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
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
    school: { findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args) },
    schoolSettings: { findUnique: (...args: unknown[]) => mockSchoolSettingsFindUnique(...args) },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      create: (...args: unknown[]) => mockUserCreate(...args),
    },
  },
}));

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/user/create", { method: "POST", body: JSON.stringify(body) });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const validBody = { name: "Jane Doe", role: "TEACHER", password: "Password123" };

describe("POST /api/user/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindUnique.mockReset().mockResolvedValue({ name: "Test School" });
    mockSchoolSettingsFindUnique.mockReset().mockResolvedValue(null);
    mockUserFindUnique.mockReset().mockResolvedValue(null);
    mockUserCreate.mockReset();
    mockBcryptHash.mockReset().mockResolvedValue("hashed-pw");
    mockPurgeSchoolDashboardServerCacheMatching.mockReset();
    mockSanitizeTeachingClassIds.mockReset().mockResolvedValue([]);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 403 for a role that cannot create users", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(request({ name: "Jane" }));
    expect(res.status).toBe(400);
  });

  it("generates a school-domain email from the name when none is provided", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserCreate.mockResolvedValue({ id: "u2", name: "Jane Doe", email: "jane.doe@testschool.com", role: "TEACHER" });

    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.user.email).toMatch(/@testschool\.com$/);
  });

  it("appends a counter suffix when the generated email already exists", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValueOnce({ id: "existing" }).mockResolvedValueOnce(null);
    mockUserCreate.mockResolvedValue({ id: "u2", name: "Jane Doe", email: "x", role: "TEACHER" });

    await POST(request(validBody));
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: expect.stringMatching(/^jane\.doe\.1@/) }),
      })
    );
  });

  it("uses a valid provided email as-is", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserCreate.mockResolvedValue({ id: "u2", name: "Jane Doe", email: "custom@example.com", role: "TEACHER" });

    await POST(request({ ...validBody, email: "custom@example.com" }));
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "custom@example.com" }) })
    );
  });

  it("returns 403 when a TEACHER tries to create a non-student role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "s1", allowedFeatures: [] } });
    const res = await POST(request({ ...validBody, role: "TEACHER" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.message).toMatch(/only create students/i);
  });

  it("returns 403 when a TEACHER assigns a feature they don't have", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "t1", role: "TEACHER", schoolId: "s1", allowedFeatures: ["HOMEWORK"] },
    });
    const res = await POST(
      request({ name: "New Student", role: "STUDENT", password: "pw", allowedFeatures: ["EXAMS"] })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.invalid).toEqual(["EXAMS"]);
  });

  it("lets a TEACHER create a student with a subset of their own allowedFeatures", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "t1", role: "TEACHER", schoolId: "s1", allowedFeatures: ["HOMEWORK"] },
    });
    mockUserCreate.mockResolvedValue({ id: "stu1", name: "New Student", email: "x", role: "STUDENT" });

    const res = await POST(
      request({ name: "New Student", role: "student", password: "pw", allowedFeatures: ["HOMEWORK"] })
    );
    expect(res.status).toBe(201);
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "STUDENT" }) })
    );
  });

  it("hashes the password before storing it", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserCreate.mockResolvedValue({ id: "u2", name: "Jane Doe", email: "x", role: "TEACHER" });
    await POST(request(validBody));
    expect(mockBcryptHash).toHaveBeenCalledWith("Password123", 10);
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ password: "hashed-pw" }) })
    );
  });

  it("parses a dd-mm-yyyy joiningDate for teacher fields", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserCreate.mockResolvedValue({ id: "u2", name: "Jane Doe", email: "x", role: "TEACHER" });

    await POST(request({ ...validBody, joiningDate: "15-06-2023" }));
    const createCall = mockUserCreate.mock.calls[0][0];
    expect(createCall.data.joiningDate).toEqual(new Date(2023, 5, 15));
  });

  it("sanitizes assignedClassIds and purges dashboard caches for a TEACHER", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockSanitizeTeachingClassIds.mockResolvedValue(["c1", "c2"]);
    mockUserCreate.mockResolvedValue({ id: "u2", name: "Jane Doe", email: "x", role: "TEACHER" });

    await POST(request({ ...validBody, assignedClassIds: ["c1", "c2", "bogus"] }));
    expect(mockSanitizeTeachingClassIds).toHaveBeenCalledWith(["c1", "c2", "bogus"], "s1");
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teachingClassIds: ["c1", "c2"] }) })
    );
    expect(mockPurgeSchoolDashboardServerCacheMatching).toHaveBeenCalledWith("teacher:list:s1");
    expect(mockPurgeSchoolDashboardServerCacheMatching).toHaveBeenCalledWith("class:list:lite:s1");
  });

  it("does not purge caches or sanitize class ids for a non-teacher role", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserCreate.mockResolvedValue({ id: "u2", name: "Jane Doe", email: "x", role: "STUDENT" });

    await POST(request({ ...validBody, role: "STUDENT" }));
    expect(mockSanitizeTeachingClassIds).not.toHaveBeenCalled();
    expect(mockPurgeSchoolDashboardServerCacheMatching).not.toHaveBeenCalled();
  });

  it("returns 500 when user creation throws", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserCreate.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(request(validBody));
    expect(res.status).toBe(500);
  });
});
