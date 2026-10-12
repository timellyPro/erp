/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/communication/appointments/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockClassFindFirst = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockAppointmentFindMany = jest.fn();
const mockAppointmentCreate = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    appointment: {
      create: (...args: unknown[]) => mockAppointmentCreate(...args),
    },
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
  },
}));

// GET's reads go through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md); POST still uses the plain prisma import.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      appointment: { findMany: (...args: unknown[]) => mockAppointmentFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/communication/appointments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/communication/appointments", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindUnique.mockReset();
    mockClassFindFirst.mockReset();
    mockSchoolFindFirst.mockReset();
    mockAppointmentFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for roles that cannot view appointments", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 400 when the student has no studentId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("lists appointments for a student", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "STUDENT", schoolId: "s1", studentId: "st1" },
    });
    mockAppointmentFindMany.mockResolvedValue([{ id: "a1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockAppointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentId: "st1", schoolId: "s1" }) })
    );
  });

  it("lists appointments for a teacher", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "s1" } });
    mockAppointmentFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockAppointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ teacherId: "t1", schoolId: "s1" }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "s1" } });
    mockAppointmentFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/communication/appointments", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserFindUnique.mockReset();
    mockAppointmentCreate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await POST(makeRequest({ teacherId: "t1" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when teacherId is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1", schoolId: "s1" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the selected teacher isn't part of the student's school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1", schoolId: "s1" } });
    mockUserFindUnique.mockResolvedValue({ id: "t1", role: "TEACHER", schoolId: "s2", teacherSchools: [] });
    const res = await POST(makeRequest({ teacherId: "t1" }));
    expect(res.status).toBe(400);
  });

  it("creates the appointment and returns 201", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1", schoolId: "s1" } });
    mockUserFindUnique.mockResolvedValue({ id: "t1", role: "TEACHER", schoolId: "s1", teacherSchools: [] });
    mockAppointmentCreate.mockResolvedValue({ id: "a1", status: "PENDING" });
    const res = await POST(makeRequest({ teacherId: "t1", note: "help" }));
    expect(res.status).toBe(201);
    expect(mockAppointmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ studentId: "st1", teacherId: "t1", schoolId: "s1", status: "PENDING" }),
      })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1", schoolId: "s1" } });
    mockUserFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ teacherId: "t1" }));
    expect(res.status).toBe(500);
  });
});
