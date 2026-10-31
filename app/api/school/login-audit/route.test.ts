/**
 * @jest-environment node
 */
import { GET } from "@/app/api/school/login-audit/route";

const mockGetServerSession = jest.fn();
const mockResolveSchoolAdminSchoolId = jest.fn();
const mockLoadLoginAudit = jest.fn();
const mockRunInTenantScope = jest.fn();

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: () => unknown) => mockRunInTenantScope(schoolId, fn),
  tenantDb: {},
}));
jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("@/lib/auth/authOptions", () => ({}));
jest.mock("@/lib/school/resolveSchoolAdminSchoolId", () => ({
  resolveSchoolAdminSchoolId: (...args: unknown[]) => mockResolveSchoolAdminSchoolId(...args),
}));
jest.mock("@/lib/school/loginAudit", () => ({
  ...jest.requireActual("@/lib/school/loginAudit"),
  loadLoginAudit: (...args: unknown[]) => mockLoadLoginAudit(...args),
}));

const PAGE = { from: "2026-10-25", to: "2026-10-31", page: 1, pageSize: 50, total: 0, entries: [], classes: [] };

const req = (query = "") => new Request(`http://localhost/api/school/login-audit${query}`);

describe("GET /api/school/login-audit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveSchoolAdminSchoolId.mockResolvedValue({ schoolId: "school-1" });
    mockLoadLoginAudit.mockResolvedValue(PAGE);
    mockRunInTenantScope.mockImplementation((_id: string, fn: () => unknown) => fn());
  });

  it("401 without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it.each(["SUPERADMIN", "CHAIRMAN", "TEACHER", "STUDENT"])("403 for %s", async (role) => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role, schoolId: "school-1" } });
    expect((await GET(req())).status).toBe(403);
    expect(mockLoadLoginAudit).not.toHaveBeenCalled();
  });

  describe("school admin", () => {
    beforeEach(() => mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "school-1" } }));

    it("loads the server-resolved school inside its tenant scope, ignoring any ?schoolId=", async () => {
      const res = await GET(req("?schoolId=someone-elses&category=TEACHER&from=2026-10-01&to=2026-10-31&q=ravi&page=2"));

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await res.json()).toEqual(PAGE);
      expect(mockRunInTenantScope).toHaveBeenCalledWith("school-1", expect.any(Function));
      expect(mockLoadLoginAudit).toHaveBeenCalledWith(
        expect.anything(),
        "school-1",
        expect.objectContaining({ category: "TEACHER", from: "2026-10-01", to: "2026-10-31", q: "ravi", page: 2 })
      );
    });

    it.each([
      ["?category=EVERYONE", "Unknown category"],
      ["?from=31-10-2026", "Dates must be YYYY-MM-DD"],
      ["?from=2026-10-31&to=2026-10-01", "From date is after To date"],
    ])("400 for %s", async (query, message) => {
      const res = await GET(req(query));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message });
      expect(mockLoadLoginAudit).not.toHaveBeenCalled();
    });

    it("passes through the school-resolution error", async () => {
      mockResolveSchoolAdminSchoolId.mockResolvedValue({ error: "School not found", status: 400 });
      const res = await GET(req());
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: "School not found" });
    });

    it("500 when loading fails", async () => {
      mockLoadLoginAudit.mockRejectedValue(new Error("db down"));
      expect((await GET(req())).status).toBe(500);
    });
  });
});
