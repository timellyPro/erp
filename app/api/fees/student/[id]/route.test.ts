/**
 * @jest-environment node
 */
import { GET, PATCH } from "@/app/api/fees/student/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockStudentFeeFindUnique = jest.fn();
const mockStudentFeeUpdate = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockApprovalFindFirst = jest.fn();
const mockApprovalUpdate = jest.fn();
const mockApprovalCreate = jest.fn();
const mockApprovalFindMany = jest.fn();
const mockInvalidateStudentFeeReadCaches = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...args: unknown[]) => mockInvalidateStudentFeeReadCaches(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    studentFee: {
      findUnique: (...args: unknown[]) => mockStudentFeeFindUnique(...args),
      update: (...args: unknown[]) => mockStudentFeeUpdate(...args),
    },
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    feeDiscountApproval: {
      findFirst: (...args: unknown[]) => mockApprovalFindFirst(...args),
      update: (...args: unknown[]) => mockApprovalUpdate(...args),
      create: (...args: unknown[]) => mockApprovalCreate(...args),
      findMany: (...args: unknown[]) => mockApprovalFindMany(...args),
    },
  },
}));

const ctx = { params: { id: "stu1" } };

const getRequest = () => new Request("http://localhost/api/fees/student/stu1");
const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/fees/student/stu1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const existingFee = {
  id: "sf1",
  studentId: "stu1",
  totalFee: 1000,
  discountPercent: 0,
  amountPaid: 200,
  student: { schoolId: "s1" },
};

describe("GET /api/fees/student/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFeeFindUnique.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(getRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the student has no fee record", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue(null);
    const res = await GET(getRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns the fee with its recent discount approvals", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue({
      id: "sf1",
      student: { schoolId: "s1" },
      discountApprovals: [{ id: "app1" }],
    });
    const res = await GET(getRequest(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fee.discountApprovals).toHaveLength(1);
  });

  it("returns 403 when a school-scoped user reads another school's fee record (cross-tenant)", async () => {
    mockGetServerSession.mockResolvedValue(adminSession); // session.user.schoolId = "s1"
    mockStudentFeeFindUnique.mockResolvedValue({
      id: "sf1",
      student: { schoolId: "s2" }, // belongs to a different school
      discountApprovals: [],
    });
    const res = await GET(getRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("allows a SUPERADMIN to read fee records across schools", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN", schoolId: null } });
    mockStudentFeeFindUnique.mockResolvedValue({
      id: "sf1",
      student: { schoolId: "s2" },
      discountApprovals: [],
    });
    const res = await GET(getRequest(), ctx);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/fees/student/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFeeFindUnique.mockReset();
    mockStudentFeeUpdate.mockReset();
    mockStudentFindUnique.mockReset().mockResolvedValue({ schoolId: "s1" });
    mockApprovalFindFirst.mockReset();
    mockApprovalUpdate.mockReset();
    mockApprovalCreate.mockReset();
    mockApprovalFindMany.mockReset().mockResolvedValue([]);
    mockInvalidateStudentFeeReadCaches.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ totalFee: 1000 }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await PATCH(patchRequest({ totalFee: 1000 }), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the student has no fee record", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ totalFee: 1000 }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when a school-scoped user edits another school's fee record", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue({ ...existingFee, student: { schoolId: "other-school" } });
    const res = await PATCH(patchRequest({ totalFee: 1000 }), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-positive totalFee", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue(existingFee);
    const res = await PATCH(patchRequest({ totalFee: 0 }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a discountPercent outside 0-100", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue(existingFee);
    const res = await PATCH(patchRequest({ totalFee: 1000, discountPercent: 150 }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when a discount is requested without a fee head", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue(existingFee);
    const res = await PATCH(
      patchRequest({ totalFee: 1000, discountPercent: 10, discountRemarks: "abc" }),
      ctx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/select the fee head/i);
  });

  it("returns 400 when a discount is requested with remarks shorter than 3 characters", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue(existingFee);
    const res = await PATCH(
      patchRequest({ totalFee: 1000, discountPercent: 10, discountFeeHeadKey: "TUITION", discountRemarks: "ok" }),
      ctx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/at least 3 characters/i);
  });

  it("updates totalFee directly (no discount) and invalidates fee-read caches", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue(existingFee);
    mockStudentFeeUpdate.mockResolvedValue({ id: "sf1", totalFee: 1200, finalFee: 1200 });

    const res = await PATCH(patchRequest({ totalFee: 1200 }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fee.totalFee).toBe(1200);
    expect(mockStudentFeeUpdate).toHaveBeenCalledWith({
      where: { studentId: "stu1" },
      data: expect.objectContaining({
        totalFee: 1200,
        discountPercent: 0,
        finalFee: 1200,
        remainingFee: 1000,
        discountFeeHeadKey: null,
      }),
    });
    expect(mockApprovalCreate).not.toHaveBeenCalled();
    expect(mockInvalidateStudentFeeReadCaches).toHaveBeenCalledWith({ studentId: "stu1", schoolId: "s1" });
  });

  it("creates a new pending discount approval instead of applying the discount directly", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue(existingFee);
    mockApprovalFindFirst.mockResolvedValue(null);
    mockApprovalCreate.mockResolvedValue({ id: "app1", status: "PENDING" });

    const res = await PATCH(
      patchRequest({
        totalFee: 1000,
        discountPercent: 10,
        discountFeeHeadKey: "TUITION",
        discountFeeHeadLabel: "Tuition",
        discountRemarks: "Sibling discount",
      }),
      ctx
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pendingApproval).toBe(true);
    expect(json.message).toMatch(/submitted for chairman approval/i);

    expect(mockApprovalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "stu1",
        schoolId: "s1",
        totalFee: 1000,
        discountPercent: 10,
        discountFixedAmount: 100,
        finalFee: 900,
        discountFeeHeadKey: "TUITION",
      }),
    });
    expect(mockStudentFeeUpdate).not.toHaveBeenCalled();
  });

  it("updates an existing pending discount approval instead of creating a new one", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue(existingFee);
    mockApprovalFindFirst.mockResolvedValue({ id: "existing-app" });
    mockApprovalUpdate.mockResolvedValue({ id: "existing-app", status: "PENDING" });

    const res = await PATCH(
      patchRequest({
        totalFee: 1000,
        discountPercent: 15,
        discountFeeHeadKey: "TUITION",
        discountRemarks: "Updated remarks",
      }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(mockApprovalUpdate).toHaveBeenCalledWith({
      where: { id: "existing-app" },
      data: expect.objectContaining({
        reviewedById: null,
        reviewRemarks: null,
        reviewedAt: null,
        discountPercent: 15,
      }),
    });
    expect(mockApprovalCreate).not.toHaveBeenCalled();
  });

  it("uses a fixed discount amount over the percent when both are provided", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockStudentFeeFindUnique.mockResolvedValue(existingFee);
    mockApprovalFindFirst.mockResolvedValue(null);
    mockApprovalCreate.mockResolvedValue({ id: "app1", status: "PENDING" });

    const res = await PATCH(
      patchRequest({
        totalFee: 1000,
        discountPercent: 10,
        discountFixedAmount: 50,
        discountFeeHeadKey: "TUITION",
        discountRemarks: "Fixed discount",
      }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(mockApprovalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ discountFixedAmount: 50, finalFee: 950 }),
    });
  });
});
