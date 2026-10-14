/**
 * @jest-environment node
 */
import { GET, PUT, DELETE } from "@/app/api/admissions/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockStudentApplicationFindFirst = jest.fn();
const mockStudentApplicationUpdate = jest.fn();
const mockStudentApplicationDelete = jest.fn();
const mockClassFindUnique = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockStudentUpdate = jest.fn();
const mockGetApplicationGateRow = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/admission/admissionsListQuery", () => ({
  getApplicationGateRow: (...args: unknown[]) => mockGetApplicationGateRow(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    studentApplication: {
      findFirst: (...args: unknown[]) => mockStudentApplicationFindFirst(...args),
      update: (...args: unknown[]) => mockStudentApplicationUpdate(...args),
      delete: (...args: unknown[]) => mockStudentApplicationDelete(...args),
    },
    class: { findUnique: (...args: unknown[]) => mockClassFindUnique(...args) },
    student: {
      findFirst: (...args: unknown[]) => mockStudentFindFirst(...args),
      update: (...args: unknown[]) => mockStudentUpdate(...args),
    },
  },
}));

// GET's reads go through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md); PUT/DELETE still use the plain prisma import.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      studentApplication: { findFirst: (...args: unknown[]) => mockStudentApplicationFindFirst(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeGetRequest() {
  return new Request("http://localhost/api/admissions/app1");
}
function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/admissions/app1", { method: "PUT", body: JSON.stringify(body) });
}
function makeDeleteRequest() {
  return new Request("http://localhost/api/admissions/app1", { method: "DELETE" });
}
const ctx = { params: Promise.resolve({ id: "app1" }) };

const validBody = {
  dateOfBirth: "2015-01-01",
  applicationNo: "APP/2026/001",
  firstName: "Alice",
  lastName: "Smith",
  nationality: "Indian",
  languagesAtHome: "English",
  houseNo: "1",
  street: "Main St",
  city: "City",
  state: "State",
  pinCode: "123456",
  parentName: "Bob Smith",
  parentOccupation: "Engineer",
  officeAddress: "Office",
  parentPhone: "9876543210",
  parentWhatsapp: "9876543210",
};

describe("GET /api/admissions/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockStudentApplicationFindFirst.mockReset();
    mockGetApplicationGateRow.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that can't manage admissions", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await GET(makeGetRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the application isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns the application with workflowStatus", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationFindFirst.mockResolvedValue({ id: "app1", firstName: "Alice" });
    mockGetApplicationGateRow.mockResolvedValue({ workflowStatus: "UPCOMING" });
    const res = await GET(makeGetRequest(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.application.workflowStatus).toBe("UPCOMING");
  });
});

describe("PUT /api/admissions/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindUnique.mockReset();
    mockStudentApplicationFindFirst.mockReset();
    mockStudentApplicationUpdate.mockReset();
    mockStudentFindFirst.mockReset();
    mockStudentUpdate.mockReset();
    mockStudentApplicationFindFirst.mockResolvedValue({ studentId: null });
    mockStudentApplicationUpdate.mockResolvedValue({ id: "app1" });
  });

  it("returns 400 for an invalid dateOfBirth", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await PUT(makePutRequest({ ...validBody, dateOfBirth: "nope" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the linked application row can't be found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest(validBody), ctx);
    expect(res.status).toBe(404);
  });

  it("updates the application and syncs the linked student's names", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationFindFirst
      .mockResolvedValueOnce({ studentId: "st1" })
      .mockResolvedValueOnce({ id: "app1" });
    mockStudentFindFirst.mockResolvedValue({ id: "st1" });
    const res = await PUT(makePutRequest(validBody), ctx);
    expect(res.status).toBe(200);
    expect(mockStudentUpdate).toHaveBeenCalled();
  });

  it("maps a Prisma P2002 error to a duplicate-value message", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationUpdate.mockRejectedValue({ code: "P2002", meta: { target: ["applicationNo"] } });
    const res = await PUT(makePutRequest(validBody), ctx);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/admissions/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentApplicationFindFirst.mockReset();
    mockStudentApplicationDelete.mockReset();
  });

  it("returns 404 when the application isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationFindFirst.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when the application has already been converted to a student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationFindFirst.mockResolvedValue({ id: "app1", studentId: "st1" });
    const res = await DELETE(makeDeleteRequest(), ctx);
    expect(res.status).toBe(400);
  });

  it("deletes the application", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationFindFirst.mockResolvedValue({ id: "app1", studentId: null });
    mockStudentApplicationDelete.mockResolvedValue({ id: "app1" });
    const res = await DELETE(makeDeleteRequest(), ctx);
    expect(res.status).toBe(200);
  });
});
