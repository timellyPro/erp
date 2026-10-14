/**
 * @jest-environment node
 */
import { GET } from "@/app/api/marks/consolidated/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockClassFindFirst = jest.fn();
const mockSchoolFindUnique = jest.fn();
const mockClassFindMany = jest.fn();
const mockStudentFindMany = jest.fn();
const mockMarkFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: {
      findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args),
      findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args),
    },
    class: {
      findFirst: (...args: unknown[]) => mockClassFindFirst(...args),
      findMany: (...args: unknown[]) => mockClassFindMany(...args),
    },
    student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
    mark: { findMany: (...args: unknown[]) => mockMarkFindMany(...args) },
  },
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      school: { findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args) },
      class: { findMany: (...args: unknown[]) => mockClassFindMany(...args) },
      student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
      mark: { findMany: (...args: unknown[]) => mockMarkFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/marks/consolidated${query}`);
}

describe("GET /api/marks/consolidated", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindUnique.mockReset();
    mockClassFindMany.mockReset();
    mockStudentFindMany.mockReset();
    mockMarkFindMany.mockReset();
    mockSchoolFindUnique.mockResolvedValue({ id: "s1", name: "School", address: "", logoUrl: null, admins: [] });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a disallowed role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "PARENT", schoolId: "s1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 when classIds is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 404 when no classes match", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("?classIds=c1"));
    expect(res.status).toBe(404);
  });

  it("builds per-section sheets with ranked students", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindMany.mockResolvedValue([{ id: "c1", name: "Grade 5", section: "A" }]);
    mockStudentFindMany.mockResolvedValue([
      { id: "st1", rollNo: "1", admissionNumber: "A1", classId: "c1", user: { name: "Alice" } },
      { id: "st2", rollNo: "2", admissionNumber: "A2", classId: "c1", user: { name: "Bob" } },
    ]);
    mockMarkFindMany.mockResolvedValue([
      { id: "m1", studentId: "st1", classId: "c1", subject: "Math", marks: 90, totalMarks: 100, grade: "A", examType: "MIDTERM", createdAt: new Date("2026-01-01") },
      { id: "m2", studentId: "st2", classId: "c1", subject: "Math", marks: 70, totalMarks: 100, grade: "B", examType: "MIDTERM", createdAt: new Date("2026-01-01") },
    ]);
    const res = await GET(makeRequest("?classIds=c1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sheets).toHaveLength(1);
    expect(json.sheets[0].students[0].rank).toBe(1);
    expect(json.sheets[0].students[0].name).toBe("Alice");
  });

  it("groups by class name when groupBy=class", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindMany.mockResolvedValue([
      { id: "c1", name: "Grade 5", section: "A" },
      { id: "c2", name: "Grade 5", section: "B" },
    ]);
    mockStudentFindMany.mockResolvedValue([]);
    mockMarkFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("?classIds=c1,c2&groupBy=class"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sheets).toHaveLength(1);
    expect(json.sheets[0].classIds).toEqual(["c1", "c2"]);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest("?classIds=c1"));
    expect(res.status).toBe(500);
  });
});
