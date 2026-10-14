/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/export/fee-due-report/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockSchoolFindUnique = jest.fn();
const mockStudentFeeFindMany = jest.fn();
const mockClassFeeStructureFindMany = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockClassFindMany = jest.fn();
const mockAllocationFindMany = jest.fn();
const mockBuildFeeDueReportPayload = jest.fn();
const mockFillMissingClassFeeStructuresFromSiblings = jest.fn();
const mockBuildFeeDueReportWorkbook = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/fees/feeDueReportCompute", () => ({
  buildFeeDueReportPayload: (...args: unknown[]) => mockBuildFeeDueReportPayload(...args),
  fillMissingClassFeeStructuresFromSiblings: (...args: unknown[]) =>
    mockFillMissingClassFeeStructuresFromSiblings(...args),
}));

jest.mock("@/lib/fees/feeDueReportExcel", () => ({
  buildFeeDueReportWorkbook: (...args: unknown[]) => mockBuildFeeDueReportWorkbook(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args) },
    studentFee: { findMany: (...args: unknown[]) => mockStudentFeeFindMany(...args) },
    classFeeStructure: { findMany: (...args: unknown[]) => mockClassFeeStructureFindMany(...args) },
    extraFee: { findMany: (...args: unknown[]) => mockExtraFeeFindMany(...args) },
    class: { findMany: (...args: unknown[]) => mockClassFindMany(...args) },
    paymentFeeAllocation: { findMany: (...args: unknown[]) => mockAllocationFindMany(...args) },
  },
}));

const request = (query = "") => new Request(`http://localhost/api/fees/export/fee-due-report${query}`);

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const feeRow = {
  studentId: "stu1",
  totalFee: 1000,
  finalFee: 900,
  amountPaid: 300,
  remainingFee: 600,
  discountPercent: 10,
  discountFeeHeadKey: null,
  discountFeeHeadLabel: null,
  student: {
    id: "stu1",
    admissionNumber: "A1",
    fatherName: "Father One",
    phoneNo: "9876543210",
    residencyType: "Day Scholar",
    class: { id: "c1", name: "5", section: "A" },
    user: { name: "Student One" },
  },
};

describe("GET /api/fees/export/fee-due-report", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockSchoolFindUnique.mockReset().mockResolvedValue({ name: "Test School" });
    mockStudentFeeFindMany.mockReset().mockResolvedValue([]);
    mockClassFeeStructureFindMany.mockReset().mockResolvedValue([]);
    mockExtraFeeFindMany.mockReset().mockResolvedValue([]);
    mockClassFindMany.mockReset().mockResolvedValue([]);
    mockAllocationFindMany.mockReset().mockResolvedValue([]);
    mockBuildFeeDueReportPayload.mockReset().mockReturnValue({ rows: [] });
    mockFillMissingClassFeeStructuresFromSiblings.mockReset();
    mockBuildFeeDueReportWorkbook.mockReset().mockResolvedValue({
      xlsx: { writeBuffer: jest.fn().mockResolvedValue(Buffer.from("fake-xlsx-bytes")) },
    });
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot view fee reports", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("streams the generated workbook with the expected filename and headers", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="fee-due-report-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString()).toBe("fake-xlsx-bytes");
  });

  it("filters the student query by classId and status when provided", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    await GET(request("?classId=c1&status=active"));
    expect(mockStudentFeeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { student: expect.objectContaining({ schoolId: "s1", classId: "c1" }) },
      })
    );
  });

  it("computes net paid-per-head from PAYMENT minus REFUND allocations", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFeeFindMany.mockResolvedValue([feeRow]);
    mockAllocationFindMany.mockImplementation(async ({ where }: { where: { allocationType: string } }) => {
      if (where.allocationType === "PAYMENT") {
        return [
          { studentId: "stu1", headType: "BASE_COMPONENT", componentIndex: 0, extraFeeId: null, allocatedAmount: 900 },
        ];
      }
      return [
        { studentId: "stu1", headType: "BASE_COMPONENT", componentIndex: 0, extraFeeId: null, allocatedAmount: 100 },
      ];
    });

    const res = await GET(request());
    expect(res.status).toBe(200);
    const callArgs = mockBuildFeeDueReportPayload.mock.calls[0][0];
    const netMap = callArgs.netPaidByStudentHead as Map<string, number>;
    expect(netMap.get("stu1|BASE:0")).toBe(800);
    expect(callArgs.students).toEqual([
      expect.objectContaining({
        studentId: "stu1",
        classDisplay: "5 - A",
        admissionNo: "A1",
        parent: "Father One",
        mobile: "9876543210",
      }),
    ]);
  });

  it("skips the allocation queries entirely when there are no fee rows", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFeeFindMany.mockResolvedValue([]);
    await GET(request());
    expect(mockAllocationFindMany).not.toHaveBeenCalled();
  });

  it("returns 500 when workbook generation fails", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockBuildFeeDueReportWorkbook.mockRejectedValue(new Error("xlsx failure"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
