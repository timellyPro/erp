/**
 * @jest-environment node
 */
import { GET } from "@/app/api/student/[id]/details-bundle/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockBuildStudentDetailsCoreBundle = jest.fn();
const mockBuildStudentDetailsNonPaymentExtras = jest.fn();
const mockBuildStudentDetailsPaymentsOnly = jest.fn();
const mockBuildStudentDetailsShellPayload = jest.fn();
const mockBuildStudentDetailsTabExtras = jest.fn();
const mockBuildStudentDetailsTabPayload = jest.fn();
const mockComputeAdminStudentFeeBreakdown = jest.fn();
const mockGetShellCached = jest.fn();
const mockSetShellCached = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
  },
}));

jest.mock("@/lib/students/buildStudentDetailsTabPayload", () => ({
  buildStudentDetailsCoreBundle: (...args: unknown[]) => mockBuildStudentDetailsCoreBundle(...args),
  buildStudentDetailsNonPaymentExtras: (...args: unknown[]) => mockBuildStudentDetailsNonPaymentExtras(...args),
  buildStudentDetailsPaymentsOnly: (...args: unknown[]) => mockBuildStudentDetailsPaymentsOnly(...args),
  buildStudentDetailsShellPayload: (...args: unknown[]) => mockBuildStudentDetailsShellPayload(...args),
  buildStudentDetailsTabExtras: (...args: unknown[]) => mockBuildStudentDetailsTabExtras(...args),
  buildStudentDetailsTabPayload: (...args: unknown[]) => mockBuildStudentDetailsTabPayload(...args),
}));

jest.mock("@/lib/fees/computeAdminStudentFeeBreakdown", () => ({
  computeAdminStudentFeeBreakdown: (...args: unknown[]) => mockComputeAdminStudentFeeBreakdown(...args),
}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  getShellCached: (...args: unknown[]) => mockGetShellCached(...args),
  setShellCached: (...args: unknown[]) => mockSetShellCached(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/student/st1/details-bundle${query}`);
}
const context = { params: Promise.resolve({ id: "st1" }) };

describe("GET /api/student/[id]/details-bundle", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockBuildStudentDetailsCoreBundle.mockReset();
    mockBuildStudentDetailsNonPaymentExtras.mockReset();
    mockBuildStudentDetailsPaymentsOnly.mockReset();
    mockBuildStudentDetailsShellPayload.mockReset();
    mockBuildStudentDetailsTabExtras.mockReset();
    mockBuildStudentDetailsTabPayload.mockReset();
    mockComputeAdminStudentFeeBreakdown.mockReset();
    mockGetShellCached.mockReset();
    mockSetShellCached.mockReset();
    mockGetShellCached.mockReturnValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without access", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "PARENT" } });
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(403);
  });

  it("allows a student viewing their own bundle", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1" } });
    mockBuildStudentDetailsTabPayload.mockResolvedValue({ student: { id: "st1" } });
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(200);
  });

  it("returns payments-only extras when scope=payments", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockBuildStudentDetailsPaymentsOnly.mockResolvedValue({ payments: [{ id: "p1" }] });
    const res = await GET(makeRequest("?extras=1&scope=payments"), context);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.payments).toEqual([{ id: "p1" }]);
  });

  it("returns 404 for the shell when the student isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockBuildStudentDetailsShellPayload.mockResolvedValue(null);
    const res = await GET(makeRequest("?shell=1"), context);
    expect(res.status).toBe(404);
  });

  it("returns a cached shell payload when present", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockGetShellCached.mockReturnValue({ student: { id: "st1" } });
    const res = await GET(makeRequest("?shell=1"), context);
    expect(res.status).toBe(200);
    expect(mockBuildStudentDetailsShellPayload).not.toHaveBeenCalled();
  });

  it("builds and caches the shell on a cache miss", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockBuildStudentDetailsShellPayload.mockResolvedValue({ student: { id: "st1" } });
    const res = await GET(makeRequest("?shell=1"), context);
    expect(res.status).toBe(200);
    expect(mockSetShellCached).toHaveBeenCalled();
  });

  it("returns 404 for the full detail tab when the student isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockBuildStudentDetailsTabPayload.mockResolvedValue(null);
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(404);
  });

  it("returns 500 when a builder throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockBuildStudentDetailsTabPayload.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest(), context);
    expect(res.status).toBe(500);
  });
});
