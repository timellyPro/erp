/**
 * @jest-environment node
 */
import { POST } from "@/app/api/admissions/[id]/enroll/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockGetApplicationGateRow = jest.fn();
const mockEnrollStudentFromAdmissionApplication = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/admission/admissionsListQuery", () => ({
  getApplicationGateRow: (...args: unknown[]) => mockGetApplicationGateRow(...args),
}));

jest.mock("@/lib/admission/enrollStudentFromAdmissionApplication", () => ({
  enrollStudentFromAdmissionApplication: (...args: unknown[]) => mockEnrollStudentFromAdmissionApplication(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
  },
}));

function makeRequest() {
  return new Request("http://localhost/api/admissions/app1/enroll", { method: "POST" });
}
const ctx = { params: Promise.resolve({ id: "app1" }) };

describe("POST /api/admissions/[id]/enroll", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockGetApplicationGateRow.mockReset();
    mockEnrollStudentFromAdmissionApplication.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the application isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockGetApplicationGateRow.mockResolvedValue(null);
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when already enrolled", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockGetApplicationGateRow.mockResolvedValue({ studentId: "st1", workflowStatus: "PENDING" });
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the workflow status isn't Pending/Upcoming", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockGetApplicationGateRow.mockResolvedValue({ studentId: null, workflowStatus: "APPROVED" });
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(400);
  });

  it("enrolls the student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockGetApplicationGateRow.mockResolvedValue({ studentId: null, workflowStatus: "PENDING" });
    mockEnrollStudentFromAdmissionApplication.mockResolvedValue({ studentId: "st1" });
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.studentId).toBe("st1");
  });

  it("returns 500 when enrollment throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockGetApplicationGateRow.mockResolvedValue({ studentId: null, workflowStatus: "PENDING" });
    mockEnrollStudentFromAdmissionApplication.mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(500);
  });
});
