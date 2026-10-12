/**
 * @jest-environment node
 */
import { POST } from "@/app/api/marks/create/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockClassFindFirst = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockLoadConfiguredMarkLimits = jest.fn();
const mockMarkCreate = jest.fn();
const mockAssertTeacherCanEnterMarks = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/teacher/teacherMarksScope", () => ({
  assertTeacherCanEnterMarks: (...args: unknown[]) => mockAssertTeacherCanEnterMarks(...args),
}));

// Exam-type / subject max marks and subsections come from one raw query inside this helper.
jest.mock("@/lib/exams/examMarkLimits", () => ({
  ...jest.requireActual("@/lib/exams/examMarkLimits"),
  loadConfiguredMarkLimits: (...args: unknown[]) => mockLoadConfiguredMarkLimits(...args),
}));

jest.mock("@/lib/notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
    mark: { create: (...args: unknown[]) => mockMarkCreate(...args) },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/marks/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = { studentId: "st1", classId: "c1", subject: "Math", marks: 80, totalMarks: 100 };

describe("POST /api/marks/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindFirst.mockReset();
    mockStudentFindFirst.mockReset();
    mockLoadConfiguredMarkLimits.mockReset().mockResolvedValue(null);
    mockMarkCreate.mockReset();
    mockAssertTeacherCanEnterMarks.mockReset();
    mockCreateNotification.mockReset();
    mockAssertTeacherCanEnterMarks.mockResolvedValue({ ok: true });
    mockCreateNotification.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid components", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    const res = await POST(makeRequest({ ...validBody, components: "not-an-array" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    const res = await POST(makeRequest({ studentId: "st1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when marks exceed totalMarks", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    const res = await POST(makeRequest({ ...validBody, marks: 150 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no schoolId in session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the class doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("returns the scope error status when the teacher isn't allowed to enter marks", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockAssertTeacherCanEnterMarks.mockResolvedValue({ ok: false, status: 403, message: "Not your subject" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 404 when the student isn't in the class", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 400 when the exam type requires subsections but none were given", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentFindFirst.mockResolvedValue({ id: "st1" });
    mockLoadConfiguredMarkLimits.mockResolvedValue({
      maxMarks: 100,
      sections: [{ name: "Written", maxMarks: 100, order: 0 }],
      source: "exam",
    });
    const res = await POST(makeRequest({ ...validBody, examType: "midterm" }));
    expect(res.status).toBe(400);
  });

  it("creates the mark and notifies the student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentFindFirst.mockResolvedValue({ id: "st1" });
    mockMarkCreate.mockResolvedValue({
      id: "m1",
      grade: "A",
      student: { user: { id: "stu-user1" } },
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "stu-user1",
      "MARKS",
      expect.any(String),
      expect.any(String)
    );
  });

  it("sums provided components into marks/totalMarks", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentFindFirst.mockResolvedValue({ id: "st1" });
    mockMarkCreate.mockResolvedValue({ id: "m1", grade: "A", student: null });
    const res = await POST(
      makeRequest({
        studentId: "st1",
        classId: "c1",
        subject: "Math",
        components: [{ name: "Written", marks: 40, totalMarks: 50 }, { name: "Oral", marks: 20, totalMarks: 20 }],
      })
    );
    expect(res.status).toBe(201);
    expect(mockMarkCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ marks: 60, totalMarks: 70 }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
