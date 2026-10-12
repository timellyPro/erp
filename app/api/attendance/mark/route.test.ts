/**
 * @jest-environment node
 */
import { POST } from "@/app/api/attendance/mark/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockClassFindFirst = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockAttendanceUpsert = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
    attendance: { upsert: (...args: unknown[]) => mockAttendanceUpsert(...args) },
  },
}));

jest.mock("@/lib/notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/attendance/mark", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  classId: "c1",
  date: "2026-01-10",
  period: 1,
  attendances: [{ studentId: "st1", status: "PRESENT" }],
};

describe("POST /api/attendance/mark", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindFirst.mockReset();
    mockStudentFindFirst.mockReset();
    mockAttendanceUpsert.mockReset();
    mockCreateNotification.mockReset();
    mockCreateNotification.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    const res = await POST(makeRequest({ classId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an out-of-range period", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    const res = await POST(makeRequest({ ...validBody, period: 9 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when session has no schoolId", async () => {
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

  it("returns 500 (thrown inside Promise.all) when a student isn't in the class", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });

  it("returns 500 when the student is inactive", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentFindFirst.mockResolvedValue({ id: "st1", status: "INACTIVE", userId: "u1" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });

  it("marks attendance and notifies the student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentFindFirst.mockResolvedValue({ id: "st1", status: "Active", userId: "u1" });
    mockAttendanceUpsert.mockResolvedValue({ id: "att1", status: "PRESENT" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "u1",
      "ATTENDANCE",
      expect.any(String),
      expect.any(String)
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
