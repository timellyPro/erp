/**
 * @jest-environment node
 */
import { GET } from "@/app/api/admissions/list/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockStudentApplicationCount = jest.fn();
const mockStudentApplicationFindMany = jest.fn();
const mockHasWorkflowColumn = jest.fn();
const mockAdmissionWorkflowByIds = jest.fn();
const mockAdmissionListWhereSql = jest.fn();
const mockAdmissionRawCount = jest.fn();
const mockAdmissionRawIdsPage = jest.fn();
const mockGetAdmissionsListCached = jest.fn();
const mockSetAdmissionsListCached = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    studentApplication: {
      count: (...args: unknown[]) => mockStudentApplicationCount(...args),
      findMany: (...args: unknown[]) => mockStudentApplicationFindMany(...args),
    },
  },
}));

jest.mock("@/lib/admission/admissionsListQuery", () => ({
  admissionListWhereSql: (...args: unknown[]) => mockAdmissionListWhereSql(...args),
  admissionRawCount: (...args: unknown[]) => mockAdmissionRawCount(...args),
  admissionRawIdsPage: (...args: unknown[]) => mockAdmissionRawIdsPage(...args),
  admissionWorkflowByIds: (...args: unknown[]) => mockAdmissionWorkflowByIds(...args),
  studentApplicationHasWorkflowColumn: (...args: unknown[]) => mockHasWorkflowColumn(...args),
}));

jest.mock("@/lib/admission/admissionsListServerCache", () => ({
  admissionsListCacheKey: (schoolId: string, qs: string) => `${schoolId}:${qs}`,
  getAdmissionsListCached: (...args: unknown[]) => mockGetAdmissionsListCached(...args),
  setAdmissionsListCached: (...args: unknown[]) => mockSetAdmissionsListCached(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/admissions/list${query}`);
}

describe("GET /api/admissions/list", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockStudentApplicationCount.mockReset();
    mockStudentApplicationFindMany.mockReset();
    mockHasWorkflowColumn.mockReset();
    mockAdmissionWorkflowByIds.mockReset();
    mockAdmissionListWhereSql.mockReset();
    mockAdmissionRawCount.mockReset();
    mockAdmissionRawIdsPage.mockReset();
    mockGetAdmissionsListCached.mockReset();
    mockSetAdmissionsListCached.mockReset();

    mockHasWorkflowColumn.mockResolvedValue(false);
    mockStudentApplicationCount.mockResolvedValue(0);
    mockGetAdmissionsListCached.mockReturnValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that can't manage admissions", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns a cached payload when present", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockGetAdmissionsListCached.mockReturnValue({ applications: [{ id: "cached" }] });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockStudentApplicationFindMany).not.toHaveBeenCalled();
  });

  it("returns the standard paginated list for the default phase", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationFindMany.mockResolvedValue([{ id: "app1", studentId: null }]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applications[0].workflowStatus).toBe("PENDING");
    expect(mockSetAdmissionsListCached).toHaveBeenCalled();
  });

  it("uses the raw-SQL pipeline for phase=pending", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockAdmissionListWhereSql.mockReturnValue("SQL");
    mockAdmissionRawCount.mockResolvedValue(1);
    mockAdmissionRawIdsPage.mockResolvedValue(["app1"]);
    mockStudentApplicationFindMany.mockResolvedValue([{ id: "app1", studentId: null }]);
    mockAdmissionWorkflowByIds.mockResolvedValue(new Map([["app1", "PENDING"]]));
    const res = await GET(makeRequest("?phase=pending"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applications).toHaveLength(1);
  });

  it("returns empty applications quickly when the raw pipeline finds no ids", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockAdmissionListWhereSql.mockReturnValue("SQL");
    mockAdmissionRawCount.mockResolvedValue(0);
    mockAdmissionRawIdsPage.mockResolvedValue([]);
    const res = await GET(makeRequest("?phase=upcoming"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applications).toEqual([]);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
