/**
 * @jest-environment node
 */
import { GET } from "@/app/api/homework/[id]/submissions/route";

const mockGetServerSession = jest.fn();
const mockHomeworkFindUnique = jest.fn();
const mockClassFindFirst = jest.fn();
const mockSubmissionFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    homework: { findUnique: (...args: unknown[]) => mockHomeworkFindUnique(...args) },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    homeworkSubmission: { findMany: (...args: unknown[]) => mockSubmissionFindMany(...args) },
  },
}));

// When the caller has a schoolId, reads go through the app_tenant-connected,
// RLS-restricted client (docs/SECURITY_REVIEW.md), backed by the same mocks.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      homework: { findUnique: (...args: unknown[]) => mockHomeworkFindUnique(...args) },
      class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
      homeworkSubmission: { findMany: (...args: unknown[]) => mockSubmissionFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest() {
  return new Request("http://localhost/api/homework/hw1/submissions");
}

const context = { params: Promise.resolve({ id: "hw1" }) };

const homeworkRow = {
  id: "hw1",
  title: "HW1",
  subject: "Math",
  classId: "c1",
  schoolId: "s1",
  teacherId: "t1",
};

describe("GET /api/homework/[id]/submissions", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockHomeworkFindUnique.mockReset();
    mockClassFindFirst.mockReset();
    mockSubmissionFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the homework doesn't exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockHomeworkFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(404);
  });

  it("returns 403 when a different teacher who doesn't own the class asks", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t2", role: "TEACHER", schoolId: "s1" } });
    mockHomeworkFindUnique.mockResolvedValue(homeworkRow);
    mockClassFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(403);
  });

  it("returns 403 for a non-teacher, non-admin role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    mockHomeworkFindUnique.mockResolvedValue(homeworkRow);
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(403);
  });

  it("allows the owning teacher and returns submissions", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "s1" } });
    mockHomeworkFindUnique.mockResolvedValue(homeworkRow);
    mockSubmissionFindMany.mockResolvedValue([
      {
        id: "sub1",
        content: "done",
        fileUrl: null,
        submittedAt: new Date("2026-01-01"),
        studentId: "st1",
        student: { admissionNumber: "A1", fatherName: "F", rollNo: "1", user: { name: "Alice" } },
      },
    ]);
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.submissions[0].studentName).toBe("Alice");
  });

  it("allows a school admin regardless of teacher ownership", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "admin1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockHomeworkFindUnique.mockResolvedValue(homeworkRow);
    mockSubmissionFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "s1" } });
    mockHomeworkFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(500);
  });
});
