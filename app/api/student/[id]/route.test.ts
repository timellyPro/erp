/**
 * @jest-environment node
 */
import { GET, PUT, DELETE } from "@/app/api/student/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockRequireSchoolId = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockStudentUpdate = jest.fn();
const mockStudentDelete = jest.fn();
const mockUserUpdate = jest.fn();
const mockUserDelete = jest.fn();
const mockClassFindFirst = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockPaymentFindMany = jest.fn();
const mockAttendanceFindMany = jest.fn();
const mockMarkFindMany = jest.fn();
const mockCertificateFindMany = jest.fn();
const mockPaymentFeeAllocationFindMany = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockStudentApplicationFindFirst = jest.fn();
const mockStudentFeeFindUnique = jest.fn();

const mockBackfill = jest.fn();
const mockLoadFeeSnapshot = jest.fn();
const mockLoadAdmissionPayments = jest.fn();
const mockUpsertStudentFeeFromStructure = jest.fn();
const mockSyncStudentDisplayNameRecords = jest.fn();
const mockEnsureStudentApplicationLink = jest.fn();
const mockHashStudentPasswordFromDob = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/auth/tenant", () => ({
  ...jest.requireActual("@/lib/auth/tenant"),
  requireSchoolId: (...args: unknown[]) => mockRequireSchoolId(...args),
}));

jest.mock("@/lib/fees/backfillPaymentAllocationComponentNames", () => ({
  backfillPaymentAllocationComponentNames: (...args: unknown[]) => mockBackfill(...args),
}));

jest.mock("@/lib/admission/studentAdmissionApplicationPayments", () => {
  const actual = jest.requireActual("@/lib/admission/studentAdmissionApplicationPayments");
  return {
    ...actual,
    loadStudentApplicationFeeSnapshot: (...args: unknown[]) => mockLoadFeeSnapshot(...args),
    loadStudentAdmissionApplicationPayments: (...args: unknown[]) => mockLoadAdmissionPayments(...args),
  };
});

jest.mock("@/lib/fees/studentTuitionFromStructure", () => ({
  upsertStudentFeeFromStructure: (...args: unknown[]) => mockUpsertStudentFeeFromStructure(...args),
}));

jest.mock("@/lib/students/syncStudentDisplayName", () => ({
  syncStudentDisplayNameRecords: (...args: unknown[]) => mockSyncStudentDisplayNameRecords(...args),
}));

jest.mock("@/lib/admission/ensureStudentApplicationLink", () => ({
  ensureStudentApplicationLink: (...args: unknown[]) => mockEnsureStudentApplicationLink(...args),
}));

jest.mock("@/lib/students/studentDefaultPassword", () => ({
  hashStudentPasswordFromDob: (...args: unknown[]) => mockHashStudentPasswordFromDob(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: {
      findFirst: (...args: unknown[]) => mockStudentFindFirst(...args),
      findUnique: (...args: unknown[]) => mockStudentFindUnique(...args),
      update: (...args: unknown[]) => mockStudentUpdate(...args),
      delete: (...args: unknown[]) => mockStudentDelete(...args),
    },
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
      delete: (...args: unknown[]) => mockUserDelete(...args),
    },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    payment: { findMany: (...args: unknown[]) => mockPaymentFindMany(...args) },
    attendance: { findMany: (...args: unknown[]) => mockAttendanceFindMany(...args) },
    mark: { findMany: (...args: unknown[]) => mockMarkFindMany(...args) },
    certificate: { findMany: (...args: unknown[]) => mockCertificateFindMany(...args) },
    paymentFeeAllocation: { findMany: (...args: unknown[]) => mockPaymentFeeAllocationFindMany(...args) },
    extraFee: { findMany: (...args: unknown[]) => mockExtraFeeFindMany(...args) },
    studentApplication: { findFirst: (...args: unknown[]) => mockStudentApplicationFindFirst(...args) },
    studentFee: { findUnique: (...args: unknown[]) => mockStudentFeeFindUnique(...args) },
  },
}));

function makeGetRequest() {
  return new Request("http://localhost/api/student/st1");
}
function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/student/st1", { method: "PUT", body: JSON.stringify(body) });
}
function makeDeleteRequest() {
  return new Request("http://localhost/api/student/st1", { method: "DELETE" });
}
const context = { params: Promise.resolve({ id: "st1" }) };

const baseStudent = {
  id: "st1",
  schoolId: "s1",
  aadhaarNo: "123456789012",
  dob: new Date("2015-01-01"),
  subjects: [],
  createdAt: new Date(),
  user: { id: "u1", name: "Alice", email: "a@x.com", photoUrl: null },
  class: null,
  school: { name: "Greenwood" },
  fee: null,
  application: null,
  status: "Active",
  residencyType: "Day Scholar",
};

describe("GET /api/student/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockRequireSchoolId.mockReset();
    mockStudentFindFirst.mockReset();
    mockBackfill.mockReset();
    mockLoadFeeSnapshot.mockReset();
    mockLoadAdmissionPayments.mockReset();
    mockPaymentFindMany.mockReset();
    mockAttendanceFindMany.mockReset();
    mockMarkFindMany.mockReset();
    mockCertificateFindMany.mockReset();
    mockPaymentFeeAllocationFindMany.mockReset();
    mockExtraFeeFindMany.mockReset();
    mockStudentApplicationFindFirst.mockReset();

    mockBackfill.mockResolvedValue(undefined);
    mockLoadFeeSnapshot.mockResolvedValue(null);
    mockLoadAdmissionPayments.mockResolvedValue([]);
    mockPaymentFindMany.mockResolvedValue([]);
    mockAttendanceFindMany.mockResolvedValue([]);
    mockMarkFindMany.mockResolvedValue([]);
    mockCertificateFindMany.mockResolvedValue([]);
    mockPaymentFeeAllocationFindMany.mockResolvedValue([]);
    mockExtraFeeFindMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), context);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without access", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "PARENT" } });
    const res = await GET(makeGetRequest(), context);
    expect(res.status).toBe(403);
  });

  it("allows a student viewing their own profile", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1" } });
    mockStudentFindFirst.mockResolvedValue(baseStudent);
    const res = await GET(makeGetRequest(), context);
    expect(res.status).toBe(200);
  });

  it("returns the requireSchoolId error status for staff when it fails", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockRequireSchoolId.mockResolvedValue({ ok: false, status: 400, message: "School not found" });
    const res = await GET(makeGetRequest(), context);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the student isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), context);
    expect(res.status).toBe(404);
  });

  it("returns the full student profile for staff", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    mockStudentFindFirst.mockResolvedValue(baseStudent);
    const res = await GET(makeGetRequest(), context);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.student.name).toBe("Alice");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    mockStudentFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest(), context);
    expect(res.status).toBe(500);
  });

  it("cross-tenant: a School-A admin cannot read a School-B student's profile", async () => {
    // requireSchoolId resolves schoolId from the session/DB, never from client
    // input, so it can only ever return "s1" here. The Prisma lookup must be
    // scoped by that resolved schoolId, so a student that actually belongs to
    // school "s2" is invisible to this query.
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockRequireSchoolId.mockResolvedValue({ ok: true, schoolId: "s1" });
    mockStudentFindFirst.mockResolvedValue(null); // stu-from-s2 not found under schoolId: "s1"

    const res = await GET(makeGetRequest(), context);

    expect(res.status).toBe(404);
    expect(mockStudentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schoolId: "s1" }),
      })
    );
  });
});

describe("PUT /api/student/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockStudentFindFirst.mockReset();
    mockStudentFindUnique.mockReset();
    mockStudentUpdate.mockReset();
    mockUserUpdate.mockReset();
    mockSyncStudentDisplayNameRecords.mockReset();
    mockSyncStudentDisplayNameRecords.mockResolvedValue(undefined);
    mockStudentFindUnique.mockResolvedValue({
      admissionNumber: "ADM/1",
      fatherName: "F",
      rollNo: "1",
      user: { name: "Alice Updated", email: "a@x.com" },
      application: null,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(makePutRequest({}), context);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without access", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "PARENT" } });
    const res = await PUT(makePutRequest({}), context);
    expect(res.status).toBe(403);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest({}), context);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the student isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ name: "New Name" }), context);
    expect(res.status).toBe(404);
  });

  it("returns 400 when name is too short", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue({ id: "st1", status: "Active", user: { id: "u2", name: "Alice" } });
    const res = await PUT(makePutRequest({ name: "A" }), context);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid aadhaar length", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue({ id: "st1", status: "Active", user: { id: "u2", name: "Alice" } });
    const res = await PUT(makePutRequest({ aadhaarNo: "123" }), context);
    expect(res.status).toBe(400);
  });

  it("updates the student's name via syncStudentDisplayNameRecords", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue({
      id: "st1",
      status: "Active",
      schoolId: "s1",
      aadhaarNo: "123456789012",
      user: { id: "u2", name: "Alice" },
      class: null,
    });
    const res = await PUT(makePutRequest({ name: "Alice Updated" }), context);
    expect(res.status).toBe(200);
    expect(mockSyncStudentDisplayNameRecords).toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(makePutRequest({ name: "Alice Updated" }), context);
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/student/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockStudentFindFirst.mockReset();
    mockStudentDelete.mockReset();
    mockUserDelete.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), context);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the student isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), context);
    expect(res.status).toBe(404);
  });

  it("cross-tenant: a School-A admin cannot delete a School-B student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue(null); // stu-from-s2 not found under schoolId: "s1"

    const res = await DELETE(makeDeleteRequest(), context);

    expect(res.status).toBe(404);
    expect(mockStudentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: expect.any(String), schoolId: "s1" } })
    );
    expect(mockStudentDelete).not.toHaveBeenCalled();
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("deletes the student and linked user", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue({ id: "st1", userId: "u2" });
    mockStudentDelete.mockResolvedValue({ id: "st1" });
    mockUserDelete.mockResolvedValue({ id: "u2" });
    const res = await DELETE(makeDeleteRequest(), context);
    expect(res.status).toBe(200);
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "u2" } });
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await DELETE(makeDeleteRequest(), context);
    expect(res.status).toBe(500);
  });
});
