/**
 * @jest-environment node
 */
import { POST } from "@/app/api/fees/extra/batch-assign/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolIdForSession = jest.fn();
const mockBatchAssignStudentExtraFees = jest.fn();
const mockInvalidateStudentFeeReadCaches = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/app/api/fees/extra-head-templates/resolveSchoolId", () => ({
  resolveFeesSchoolIdForSession: (...args: unknown[]) => mockResolveFeesSchoolIdForSession(...args),
}));

jest.mock("@/lib/fees/batchAssignStudentExtraFees", () => ({
  batchAssignStudentExtraFees: (...args: unknown[]) => mockBatchAssignStudentExtraFees(...args),
}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...args: unknown[]) => mockInvalidateStudentFeeReadCaches(...args),
}));

const postRequest = (body: unknown) =>
  new Request("http://localhost/api/fees/extra/batch-assign", {
    method: "POST",
    body: JSON.stringify(body),
  });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("POST /api/fees/extra/batch-assign", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolIdForSession.mockReset();
    mockBatchAssignStudentExtraFees.mockReset();
    mockInvalidateStudentFeeReadCaches.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(postRequest({ studentId: "stu1", fees: [{}] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await POST(postRequest({ studentId: "stu1", fees: [{}] }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue(null);
    const res = await POST(postRequest({ studentId: "stu1", fees: [{}] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when studentId is missing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    const res = await POST(postRequest({ fees: [{}] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the fees array is empty", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    const res = await POST(postRequest({ studentId: "stu1", fees: [] }));
    expect(res.status).toBe(400);
  });

  it("assigns the fees and invalidates the student's fee-read caches", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockBatchAssignStudentExtraFees.mockResolvedValue({ created: 2 });

    const res = await POST(
      postRequest({ studentId: "stu1", fees: [{ name: "Sports", amount: 500 }] })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.created).toBe(2);
    expect(mockBatchAssignStudentExtraFees).toHaveBeenCalledWith("s1", "stu1", [
      { name: "Sports", amount: 500 },
    ]);
    expect(mockInvalidateStudentFeeReadCaches).toHaveBeenCalledWith({ studentId: "stu1", schoolId: "s1" });
  });

  it("maps a 'not found' helper error to 404", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockBatchAssignStudentExtraFees.mockRejectedValue(new Error("Student not found"));
    const res = await POST(postRequest({ studentId: "stu1", fees: [{}] }));
    expect(res.status).toBe(404);
  });

  it("maps an unrelated helper error to 500", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolIdForSession.mockResolvedValue("s1");
    mockBatchAssignStudentExtraFees.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(postRequest({ studentId: "stu1", fees: [{}] }));
    expect(res.status).toBe(500);
  });
});
