/**
 * @jest-environment node
 */
import { POST } from "@/app/api/student-leaves/apply/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockLeaveCreate = jest.fn();
const mockClassFindUnique = jest.fn();
const mockGetClassStaffNotifyUserIds = jest.fn();
const mockCreateNotificationsForUserIds = jest.fn();
const mockInvalidateParentPortalCaches = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/notificationService", () => ({
  getClassStaffNotifyUserIds: (...args: unknown[]) => mockGetClassStaffNotifyUserIds(...args),
  createNotificationsForUserIds: (...args: unknown[]) => mockCreateNotificationsForUserIds(...args),
}));

jest.mock("@/lib/parent/invalidateParentPortalCaches", () => ({
  invalidateParentPortalCaches: (...args: unknown[]) => mockInvalidateParentPortalCaches(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: {
      findFirst: (...args: unknown[]) => mockStudentFindFirst(...args),
      findUnique: (...args: unknown[]) => mockStudentFindUnique(...args),
    },
    class: { findUnique: (...args: unknown[]) => mockClassFindUnique(...args) },
    studentLeaveRequest: { create: (...args: unknown[]) => mockLeaveCreate(...args) },
  },
}));

const request = (body: unknown) =>
  new Request("http://localhost/api/student-leaves/apply", {
    method: "POST",
    body: JSON.stringify(body),
  });

const studentSession = { user: { id: "u1", role: "STUDENT", studentId: "stu1" } };
const validBody = { leaveType: "SICK", reason: "Fever", fromDate: "2024-01-10", toDate: "2024-01-12" };

describe("POST /api/student-leaves/apply", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindFirst.mockReset();
    mockStudentFindUnique.mockReset().mockResolvedValue({ schoolId: "s1", classId: null, user: { name: "Student One" } });
    mockLeaveCreate.mockReset();
    mockClassFindUnique.mockReset();
    mockGetClassStaffNotifyUserIds.mockReset().mockResolvedValue([]);
    mockCreateNotificationsForUserIds.mockReset().mockResolvedValue(undefined);
    mockInvalidateParentPortalCaches.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot apply for leave", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 when the student record cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 400 when reason, fromDate, or toDate is missing", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValueOnce({ schoolId: "s1" });
    const res = await POST(request({ leaveType: "SICK" }));
    expect(res.status).toBe(400);
  });

  it("defaults leaveType to CASUAL for an invalid value", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique.mockResolvedValueOnce({ schoolId: "s1" });
    mockLeaveCreate.mockResolvedValue({ id: "lv1", leaveType: "CASUAL" });

    const res = await POST(request({ ...validBody, leaveType: "BOGUS" }));
    expect(res.status).toBe(201);
    expect(mockLeaveCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leaveType: "CASUAL" }) })
    );
  });

  it("creates the leave request, notifies class staff, and invalidates parent-portal caches", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique
      .mockResolvedValueOnce({ schoolId: "s1" })
      .mockResolvedValueOnce({ schoolId: "s1", classId: "c1", user: { name: "Student One" } });
    mockClassFindUnique.mockResolvedValue({ teacherId: "t1" });
    mockGetClassStaffNotifyUserIds.mockResolvedValue(["t1"]);
    mockLeaveCreate.mockResolvedValue({ id: "lv1", leaveType: "SICK" });

    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.leave.id).toBe("lv1");

    expect(mockLeaveCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "stu1",
        schoolId: "s1",
        leaveType: "SICK",
        reason: "Fever",
      }),
    });
    expect(mockGetClassStaffNotifyUserIds).toHaveBeenCalledWith("s1", "t1");
    expect(mockCreateNotificationsForUserIds).toHaveBeenCalledWith(
      ["t1"],
      "LEAVE",
      "New student leave request",
      expect.stringContaining("Student One")
    );
    expect(mockInvalidateParentPortalCaches).toHaveBeenCalledWith({ schoolId: "s1", studentId: "stu1" });
  });

  it("resolves the student id via userId lookup when the session has no studentId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    mockStudentFindFirst.mockResolvedValue({ id: "stu2" });
    mockStudentFindUnique.mockResolvedValueOnce({ schoolId: "s1" });
    mockLeaveCreate.mockResolvedValue({ id: "lv1" });

    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    expect(mockLeaveCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ studentId: "stu2" }) })
    );
  });

  it("still succeeds when the notification step fails", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockStudentFindUnique
      .mockResolvedValueOnce({ schoolId: "s1" })
      .mockRejectedValueOnce(new Error("notify lookup failed"));
    mockLeaveCreate.mockResolvedValue({ id: "lv1" });

    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
  });
});
