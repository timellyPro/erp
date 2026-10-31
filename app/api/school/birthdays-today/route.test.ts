/**
 * @jest-environment node
 */
import { GET } from "@/app/api/school/birthdays-today/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  tenantDb: {},
}));

const mockGetServerSession = jest.fn();
const mockResolveSchoolAdminSchoolId = jest.fn();
const mockLoadBirthdaysToday = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("@/lib/auth/authOptions", () => ({}));
jest.mock("@/lib/school/resolveSchoolAdminSchoolId", () => ({
  resolveSchoolAdminSchoolId: (...args: unknown[]) => mockResolveSchoolAdminSchoolId(...args),
}));
jest.mock("@/lib/school/birthdaysToday", () => ({
  loadBirthdaysToday: (...args: unknown[]) => mockLoadBirthdaysToday(...args),
}));

describe("GET /api/school/birthdays-today", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "school-1" });
  });

  it("401 without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it.each(["TEACHER", "STUDENT", "CHAIRMAN"])("403 for %s", async (role) => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role } });
    expect((await GET()).status).toBe(403);
    expect(mockLoadBirthdaysToday).not.toHaveBeenCalled();
  });

  it("passes through the school-resolution error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ error: "School not found", status: 400 });
    const res = await GET();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "School not found" });
  });

  it("loads birthdays for the session's school only and disables caching", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "other-school" } });
    const payload = { date: "2026-10-31", count: 1, students: [{ id: "s1", name: "Asha", className: "CLASS 6 - A", admissionNumber: "A1", turning: 11 }] };
    mockLoadBirthdaysToday.mockResolvedValue(payload);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual(payload);
    expect(mockLoadBirthdaysToday).toHaveBeenCalledWith(expect.anything(), "school-1");
  });

  it("500 when loading fails", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockLoadBirthdaysToday.mockRejectedValue(new Error("db down"));
    expect((await GET()).status).toBe(500);
  });
});
