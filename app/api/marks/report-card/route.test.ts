/**
 * @jest-environment node
 */
import { GET } from "@/app/api/marks/report-card/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockClassFindFirst = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockMarkFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
    mark: { findMany: (...args: unknown[]) => mockMarkFindMany(...args) },
  },
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
      mark: { findMany: (...args: unknown[]) => mockMarkFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/marks/report-card${query}`);
}

describe("GET /api/marks/report-card", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockClassFindFirst.mockReset();
    mockStudentFindFirst.mockReset();
    mockMarkFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    mockClassFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("?studentId=st1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when studentId is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 404 when the student doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("?studentId=st1"));
    expect(res.status).toBe(404);
  });

  it("dedupes marks per subject/examType and computes a summary", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue({
      id: "st1",
      admissionNumber: "A1",
      rollNo: "1",
      fatherName: "F",
      user: { name: "Alice" },
      class: { name: "Grade 5", section: "A" },
      school: { name: "School", address: "Addr", logoUrl: null, admins: [] },
    });
    mockMarkFindMany.mockResolvedValue([
      { subject: "Math", marks: 80, totalMarks: 100, grade: "A", examType: "MIDTERM", createdAt: new Date("2026-01-02") },
      { subject: "Math", marks: 70, totalMarks: 100, grade: "B", examType: "MIDTERM", createdAt: new Date("2026-01-01") },
      { subject: "Science", marks: 90, totalMarks: 100, grade: "A+", examType: "MIDTERM", createdAt: new Date("2026-01-01") },
    ]);
    const res = await GET(makeRequest("?studentId=st1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.marks).toHaveLength(2);
    expect(json.summary.totalSubjects).toBe(2);
    expect(json.summary.totalObtained).toBe(170);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest("?studentId=st1"));
    expect(res.status).toBe(500);
  });
});
