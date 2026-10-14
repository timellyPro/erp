/**
 * @jest-environment node
 */
import { POST } from "@/app/api/homework/submit/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockHomeworkFindUnique = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockSubmissionFindUnique = jest.fn();
const mockSubmissionCreate = jest.fn();
const mockSubmissionUpdate = jest.fn();
const mockInvalidateParentPortalCaches = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    homework: { findUnique: (...args: unknown[]) => mockHomeworkFindUnique(...args) },
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    homeworkSubmission: {
      findUnique: (...args: unknown[]) => mockSubmissionFindUnique(...args),
      create: (...args: unknown[]) => mockSubmissionCreate(...args),
      update: (...args: unknown[]) => mockSubmissionUpdate(...args),
    },
  },
}));

jest.mock("@/lib/parent/invalidateParentPortalCaches", () => ({
  invalidateParentPortalCaches: (...args: unknown[]) => mockInvalidateParentPortalCaches(...args),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/homework/submit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const homeworkRow = { id: "hw1", classId: "c1", class: { schoolId: "s1" } };
const studentRow = { classId: "c1", schoolId: "s1" };

describe("POST /api/homework/submit", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockHomeworkFindUnique.mockReset();
    mockStudentFindUnique.mockReset();
    mockSubmissionFindUnique.mockReset();
    mockSubmissionCreate.mockReset();
    mockSubmissionUpdate.mockReset();
    mockInvalidateParentPortalCaches.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the session has no studentId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ homeworkId: "hw1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when homeworkId is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the homework doesn't exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    mockHomeworkFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ homeworkId: "hw1" }));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the student isn't in the homework's class", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    mockHomeworkFindUnique.mockResolvedValue(homeworkRow);
    mockStudentFindUnique.mockResolvedValue({ classId: "other", schoolId: "s1" });
    const res = await POST(makeRequest({ homeworkId: "hw1" }));
    expect(res.status).toBe(403);
  });

  it("creates a new submission and returns 201", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockHomeworkFindUnique.mockResolvedValue(homeworkRow);
    mockStudentFindUnique.mockResolvedValue(studentRow);
    mockSubmissionFindUnique.mockResolvedValue(null);
    mockSubmissionCreate.mockResolvedValue({ id: "sub1" });
    const res = await POST(makeRequest({ homeworkId: "hw1", content: "done" }));
    expect(res.status).toBe(201);
    expect(mockInvalidateParentPortalCaches).toHaveBeenCalledWith({ schoolId: "s1", studentId: "st1" });
  });

  it("updates an existing submission and returns 200", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockHomeworkFindUnique.mockResolvedValue(homeworkRow);
    mockStudentFindUnique.mockResolvedValue(studentRow);
    mockSubmissionFindUnique.mockResolvedValue({ id: "sub1" });
    mockSubmissionUpdate.mockResolvedValue({ id: "sub1", content: "updated" });
    const res = await POST(makeRequest({ homeworkId: "hw1", content: "updated" }));
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    mockHomeworkFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ homeworkId: "hw1" }));
    expect(res.status).toBe(500);
  });
});
