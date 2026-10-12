/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/admissions/[id]/workflow/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockGetApplicationGateRow = jest.fn();
const mockSetApplicationWorkflowPendingOrUpcoming = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/admission/admissionsListQuery", () => ({
  getApplicationGateRow: (...args: unknown[]) => mockGetApplicationGateRow(...args),
  setApplicationWorkflowPendingOrUpcoming: (...args: unknown[]) => mockSetApplicationWorkflowPendingOrUpcoming(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admissions/app1/workflow", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "app1" }) };

describe("PATCH /api/admissions/[id]/workflow", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockGetApplicationGateRow.mockReset();
    mockSetApplicationWorkflowPendingOrUpcoming.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ workflowStatus: "UPCOMING" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid workflowStatus", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await PATCH(makeRequest({ workflowStatus: "APPROVED" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the application isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockGetApplicationGateRow.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ workflowStatus: "UPCOMING" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when a student has already been enrolled from this application", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockGetApplicationGateRow.mockResolvedValue({ studentId: "st1" });
    const res = await PATCH(makeRequest({ workflowStatus: "UPCOMING" }), ctx);
    expect(res.status).toBe(400);
  });

  it("updates the workflow status", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockGetApplicationGateRow.mockResolvedValue({ studentId: null });
    mockSetApplicationWorkflowPendingOrUpcoming.mockResolvedValue(undefined);
    const res = await PATCH(makeRequest({ workflowStatus: "upcoming" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.workflowStatus).toBe("UPCOMING");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockGetApplicationGateRow.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH(makeRequest({ workflowStatus: "UPCOMING" }), ctx);
    expect(res.status).toBe(500);
  });
});
