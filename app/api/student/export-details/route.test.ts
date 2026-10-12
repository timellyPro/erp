/**
 * @jest-environment node
 */
import * as XLSX from "xlsx";
import { GET } from "@/app/api/student/export-details/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockUserUpdate = jest.fn();
const mockClassFindFirst = jest.fn();
const mockStudentFindMany = jest.fn();
const mockResolveStudentDisplayClass = jest.fn();
const mockStudentToDetailsExportRow = jest.fn();
const mockBuildStudentDetailsExportWorkbook = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/students/studentDetailsExport", () => ({
  buildStudentDetailsExportWorkbook: (...args: unknown[]) => mockBuildStudentDetailsExportWorkbook(...args),
  studentToDetailsExportRow: (...args: unknown[]) => mockStudentToDetailsExportRow(...args),
}));

jest.mock("@/lib/students/resolveStudentDisplayClass", () => ({
  resolveStudentDisplayClass: (...args: unknown[]) => mockResolveStudentDisplayClass(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
  },
}));

const request = (query = "") => new Request(`http://localhost/api/student/export-details${query}`);

const session = { user: { id: "u1", schoolId: "s1" } };

describe("GET /api/student/export-details", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockUserUpdate.mockReset();
    mockClassFindFirst.mockReset();
    mockStudentFindMany.mockReset().mockResolvedValue([]);
    mockResolveStudentDisplayClass.mockReset().mockReturnValue(null);
    mockStudentToDetailsExportRow.mockReset().mockImplementation((_s, i) => ({ SNo: i }));
    mockBuildStudentDetailsExportWorkbook.mockReset().mockImplementation((rows: Record<string, unknown>[]) => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Students");
      return wb;
    });
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("persists a resolved schoolId back onto the user when the session had none", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue({ id: "s2" });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { schoolId: "s2" } });
  });

  it("returns 403 when the school is paused", async () => {
    mockGetServerSession.mockResolvedValue({ ...session, user: { ...session.user, schoolIsActive: false } });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns 404 when the given classId is not in the school", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockClassFindFirst.mockResolvedValue(null);
    const res = await GET(request("?classId=c1"));
    expect(res.status).toBe(404);
  });

  it("streams the workbook with the default filename for a non-inactive export", async () => {
    mockGetServerSession.mockResolvedValue(session);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("Student-details-report.xlsx");
  });

  it("uses the inactive-report filename when status=inactive", async () => {
    mockGetServerSession.mockResolvedValue(session);
    const res = await GET(request("?status=inactive"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("Inactive-students-report.xlsx");
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "Inactive" }) })
    );
  });

  it("filters by classId when provided and valid", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    await GET(request("?classId=c1"));
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ classId: "c1" }) })
    );
  });

  it("filters by className/section when classId is omitted", async () => {
    mockGetServerSession.mockResolvedValue(session);
    await GET(request("?className=5&section=A"));
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ class: { schoolId: "s1", name: "5", section: "A" } }),
      })
    );
  });

  it("maps each student through resolveStudentDisplayClass and studentToDetailsExportRow", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindMany.mockResolvedValue([
      { id: "stu1", class: { name: "5", section: "A" }, application: { class: null } },
    ]);
    mockResolveStudentDisplayClass.mockReturnValue({ name: "5", section: "A" });

    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockStudentToDetailsExportRow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "stu1", class: { name: "5", section: "A" } }),
      1
    );
    expect(mockBuildStudentDetailsExportWorkbook).toHaveBeenCalledWith([{ SNo: 1 }]);
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
