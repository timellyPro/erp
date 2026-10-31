/**
 * @jest-environment node
 */
import { GET } from "@/app/api/parent/due-report/route";

const mockGetServerSession = jest.fn();
const mockBuild = jest.fn();
const mockSchoolIdViaStudentId = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("@/lib/auth/authOptions", () => ({}));
jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
}));
jest.mock("@/lib/auth/tenant", () => ({
  schoolIdViaStudentId: (...args: unknown[]) => mockSchoolIdViaStudentId(...args),
}));
jest.mock("@/lib/fees/buildStudentFeeDueReport", () => ({
  buildStudentFeeDueReport: (...args: unknown[]) => mockBuild(...args),
}));

const REPORT = {
  generatedAt: "2026-10-31T10:00:00.000Z",
  studentName: "Asha",
  className: "CLASS 6 - A",
  admissionNo: "ADM/2026/LS1",
  category: "Day Scholar",
  heads: [{ key: "tuition", label: "Tuition", fee: 39600, concession: 0, paid: 19250, due: 20350 }],
  totals: { fee: 39600, discount: 0, paid: 19250, due: 20350 },
  previousYear: null,
};

describe("GET /api/parent/due-report", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuild.mockResolvedValue(REPORT);
  });

  it("401 without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it.each(["SCHOOLADMIN", "SUPERADMIN", "TEACHER", "CHAIRMAN"])("403 for %s", async (role) => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role, studentId: "stu1", schoolId: "s1" } });
    expect((await GET()).status).toBe(403);
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it("403 for a student session that has no student record", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    expect((await GET()).status).toBe(403);
  });

  it("returns only the signed-in student's report, uncached", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "stu1", schoolId: "s1" } });
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ report: REPORT });
    expect(mockBuild).toHaveBeenCalledWith("s1", "stu1");
  });

  it("looks the school up from the student when the token has none", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "stu1" } });
    mockSchoolIdViaStudentId.mockResolvedValue("s9");
    expect((await GET()).status).toBe(200);
    expect(mockBuild).toHaveBeenCalledWith("s9", "stu1");
  });

  it("400 when no school can be found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "stu1" } });
    mockSchoolIdViaStudentId.mockResolvedValue(null);
    expect((await GET()).status).toBe(400);
  });

  it("404 when the student has no fee record", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "stu1", schoolId: "s1" } });
    mockBuild.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
  });

  it("500 when building fails", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "stu1", schoolId: "s1" } });
    mockBuild.mockRejectedValue(new Error("db down"));
    expect((await GET()).status).toBe(500);
  });
});
