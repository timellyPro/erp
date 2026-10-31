/**
 * @jest-environment node
 */
import { GET } from "@/app/api/school/birthdays-today/route";

const mockSchoolFindUnique = jest.fn();

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  tenantDb: { school: { findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args) } },
}));

const mockGetServerSession = jest.fn();
const mockResolveSchoolAdminSchoolId = jest.fn();
const mockLoadBirthdaysToday = jest.fn();
const mockSchoolIdViaStudentId = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("@/lib/auth/authOptions", () => ({}));
jest.mock("@/lib/school/resolveSchoolAdminSchoolId", () => ({
  resolveSchoolAdminSchoolId: (...args: unknown[]) => mockResolveSchoolAdminSchoolId(...args),
}));
jest.mock("@/lib/auth/tenant", () => ({
  schoolIdViaStudentId: (...args: unknown[]) => mockSchoolIdViaStudentId(...args),
}));
jest.mock("@/lib/school/birthdaysToday", () => ({
  ...jest.requireActual("@/lib/school/birthdaysToday"),
  loadBirthdaysToday: (...args: unknown[]) => mockLoadBirthdaysToday(...args),
}));

const FULL = {
  date: "2026-10-31",
  count: 1,
  students: [{ id: "s1", name: "Asha", className: "CLASS 6 - A", admissionNumber: "ADM/2026/LS1", turning: 11 }],
};

const req = (query = "") => new Request(`http://localhost/api/school/birthdays-today${query}`);

describe("GET /api/school/birthdays-today", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "school-1" });
    mockLoadBirthdaysToday.mockResolvedValue(FULL);
    mockSchoolFindUnique.mockResolvedValue({ id: "school-1", isActive: true });
  });

  it("401 without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it.each(["TEACHER", "CHAIRMAN"])("403 for %s", async (role) => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role } });
    expect((await GET(req())).status).toBe(403);
    expect(mockLoadBirthdaysToday).not.toHaveBeenCalled();
  });

  describe("school admin", () => {
    beforeEach(() => mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "other-school" } }));

    it("gets full details for the school the server resolves, ignoring any ?schoolId=", async () => {
      const res = await GET(req("?schoolId=someone-elses"));

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await res.json()).toEqual(FULL);
      expect(mockLoadBirthdaysToday).toHaveBeenCalledWith(expect.anything(), "school-1");
    });

    it("passes through the school-resolution error", async () => {
      mockResolveSchoolAdminSchoolId.mockResolvedValue({ error: "School not found", status: 400 });
      const res = await GET(req());
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: "School not found" });
    });

    it("500 when loading fails", async () => {
      mockLoadBirthdaysToday.mockRejectedValue(new Error("db down"));
      expect((await GET(req())).status).toBe(500);
    });
  });

  describe("superadmin", () => {
    beforeEach(() => mockGetServerSession.mockResolvedValue({ user: { id: "sa", role: "SUPERADMIN" } }));

    it("400 without a schoolId, never listing every school", async () => {
      expect((await GET(req())).status).toBe(400);
      expect(mockLoadBirthdaysToday).not.toHaveBeenCalled();
    });

    it("404 for an unknown school", async () => {
      mockSchoolFindUnique.mockResolvedValue(null);
      expect((await GET(req("?schoolId=nope"))).status).toBe(404);
    });

    it("gets full details for exactly the school named", async () => {
      mockSchoolFindUnique.mockResolvedValue({ id: "school-9" });
      const res = await GET(req("?schoolId=school-9"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(FULL);
      expect(mockLoadBirthdaysToday).toHaveBeenCalledWith(expect.anything(), "school-9");
    });
  });

  describe("parent / student", () => {
    beforeEach(() => mockGetServerSession.mockResolvedValue({ user: { id: "p1", role: "STUDENT", schoolId: "school-1", studentId: "st1" } }));

    it("gets name and class only: no admission number, no age", async () => {
      const res = await GET(req());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.students).toEqual([{ id: "s1", name: "Asha", className: "CLASS 6 - A" }]);
      expect(JSON.stringify(body)).not.toContain("ADM/2026/LS1");
      expect(JSON.stringify(body)).not.toContain("turning");
    });

    it("is pinned to their own school even if ?schoolId= names another", async () => {
      await GET(req("?schoolId=another-school"));
      expect(mockLoadBirthdaysToday).toHaveBeenCalledWith(expect.anything(), "school-1");
    });

    it("falls back to the student record when the token has no schoolId", async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: "p1", role: "STUDENT", studentId: "st1" } });
      mockSchoolIdViaStudentId.mockResolvedValue("school-1");
      expect((await GET(req())).status).toBe(200);
      expect(mockSchoolIdViaStudentId).toHaveBeenCalledWith("st1");
    });

    it("400 when no school can be found", async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: "p1", role: "STUDENT" } });
      expect((await GET(req())).status).toBe(400);
    });

    it("403 when the school's access is deactivated", async () => {
      mockSchoolFindUnique.mockResolvedValue({ id: "school-1", isActive: false });
      expect((await GET(req())).status).toBe(403);
      expect(mockLoadBirthdaysToday).not.toHaveBeenCalled();
    });
  });
});
