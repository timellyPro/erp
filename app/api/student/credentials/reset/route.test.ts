/**
 * @jest-environment node
 */
import { POST } from "@/app/api/student/credentials/reset/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockClassFindFirst = jest.fn();
const mockStudentFindMany = jest.fn();
const mockUserUpdate = jest.fn();
const mockHashStudentPasswordFromDob = jest.fn();
const mockInvalidateTenant = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/students/studentDefaultPassword", () => ({
  hashStudentPasswordFromDob: (...args: unknown[]) => mockHashStudentPasswordFromDob(...args),
}));

jest.mock("@/lib/cache/tenantCache", () => ({
  invalidateTenant: (...args: unknown[]) => mockInvalidateTenant(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
    user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
  },
}));

const request = (body: unknown = {}) =>
  new Request("http://localhost/api/student/credentials/reset", {
    method: "POST",
    body: JSON.stringify(body),
  });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("POST /api/student/credentials/reset", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockClassFindFirst.mockReset();
    mockStudentFindMany.mockReset().mockResolvedValue([]);
    mockUserUpdate.mockReset().mockResolvedValue({});
    mockHashStudentPasswordFromDob.mockReset().mockResolvedValue("hashed-pw");
    mockInvalidateTenant.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await POST(request());
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(request());
    expect(res.status).toBe(400);
  });

  it("returns 403 when the school is paused", async () => {
    mockGetServerSession.mockResolvedValue({ ...adminSession, user: { ...adminSession.user, schoolIsActive: false } });
    const res = await POST(request());
    expect(res.status).toBe(403);
  });

  it("returns 404 when the given classId is not in the school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockClassFindFirst.mockResolvedValue(null);
    const res = await POST(request({ classId: "c1" }));
    expect(res.status).toBe(404);
  });

  it("resets passwords for all active matching students and invalidates the tenant cache", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFindMany.mockResolvedValue([
      { id: "stu1", dob: new Date("2010-01-01"), userId: "user1" },
      { id: "stu2", dob: new Date("2011-02-02"), userId: "user2" },
    ]);

    const res = await POST(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.resetCount).toBe(2);
    expect(json.message).toMatch(/Reset 2 student passwords/);
    expect(mockUserUpdate).toHaveBeenCalledTimes(2);
    expect(mockInvalidateTenant).toHaveBeenCalledWith("s1");
  });

  it("uses singular wording when exactly one password is reset", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFindMany.mockResolvedValue([{ id: "stu1", dob: new Date("2010-01-01"), userId: "user1" }]);

    const res = await POST(request());
    const json = await res.json();
    expect(json.message).toMatch(/Reset 1 student password to DOB/);
  });

  it("skips a student whose password hashing fails and continues with the rest", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFindMany.mockResolvedValue([
      { id: "stu1", dob: null, userId: "user1" },
      { id: "stu2", dob: new Date("2011-02-02"), userId: "user2" },
    ]);
    mockHashStudentPasswordFromDob
      .mockRejectedValueOnce(new Error("Invalid DOB"))
      .mockResolvedValueOnce("hashed-pw");

    const res = await POST(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.resetCount).toBe(1);
    expect(mockUserUpdate).toHaveBeenCalledTimes(1);
  });

  it("filters by classId when provided and valid", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentFindMany.mockResolvedValue([]);

    await POST(request({ classId: "c1" }));
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schoolId: "s1", status: "Active", classId: "c1" }),
      })
    );
  });

  it("filters by className and section when classId is omitted", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFindMany.mockResolvedValue([]);

    await POST(request({ className: "5", section: "A" }));
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: "s1",
          class: { schoolId: "s1", name: "5", section: "A" },
        }),
      })
    );
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(request());
    expect(res.status).toBe(500);
  });
});
