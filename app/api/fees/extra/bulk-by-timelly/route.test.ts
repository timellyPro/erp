/**
 * @jest-environment node
 */
import { POST } from "@/app/api/fees/extra/bulk-by-timelly/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockStudentFindMany = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockExtraFeeCreateMany = jest.fn();
const mockStudentFeeUpdateMany = jest.fn();
const mockTxQueryRaw = jest.fn();
const mockTransaction = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
    extraFee: {
      findMany: (...args: unknown[]) => mockExtraFeeFindMany(...args),
      createMany: (...args: unknown[]) => mockExtraFeeCreateMany(...args),
    },
    studentFee: { updateMany: (...args: unknown[]) => mockStudentFeeUpdateMany(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const postRequest = (body: unknown) =>
  new Request("http://localhost/api/fees/extra/bulk-by-timelly", {
    method: "POST",
    body: JSON.stringify(body),
  });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const student1 = {
  id: "stu1",
  rollNo: "10A-01",
  admissionNumber: "SCH/2024/001",
  user: { name: "Student One" },
  application: { rollNo: null },
  fee: { id: "sf1" },
};

describe("POST /api/fees/extra/bulk-by-timelly", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockStudentFindMany.mockReset().mockResolvedValue([student1]);
    mockExtraFeeFindMany.mockReset().mockResolvedValue([]);
    mockExtraFeeCreateMany.mockReset().mockResolvedValue({ count: 0 });
    mockStudentFeeUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    mockTxQueryRaw.mockReset().mockResolvedValue([{ deletedCount: 0 }]);
    mockTransaction.mockReset().mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return arg({ $queryRaw: mockTxQueryRaw });
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(postRequest({ rows: [] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await POST(postRequest({ rows: [] }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await POST(postRequest({ rows: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when rows is empty and no cleanup was requested", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(postRequest({ rows: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when more than 800 rows are submitted", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const rows = Array.from({ length: 801 }, () => ({
      timellyId: "10A-01",
      feeName: "Sports",
      amount: 100,
    }));
    const res = await POST(postRequest({ rows }));
    expect(res.status).toBe(400);
  });

  it("runs cleanup-only when cleanupDuplicates is set and rows is empty", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockTxQueryRaw.mockResolvedValue([{ deletedCount: 4 }]);
    const res = await POST(postRequest({ rows: [], cleanupDuplicates: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ created: 0, failed: 0, errors: [], cleanedDuplicates: 4 });
    expect(mockStudentFindMany).not.toHaveBeenCalled();
  });

  it("reports per-row validation errors (empty timellyId/feeName/invalid amount)", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(
      postRequest({
        rows: [
          { timellyId: "", feeName: "Sports", amount: 100 },
          { timellyId: "10A-01", feeName: "", amount: 100 },
          { timellyId: "10A-01", feeName: "Sports", amount: -5 },
        ],
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failed).toBe(3);
    expect(json.created).toBe(0);
    expect(json.errors.map((e: { message: string }) => e.message)).toEqual([
      "Timelly ID is empty",
      "Fee name is empty",
      "Amount must be a positive number",
    ]);
  });

  it("reports an error when no student matches the Timelly ID", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(
      postRequest({ rows: [{ timellyId: "unknown-id", feeName: "Sports", amount: 100 }] })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.errors[0].message).toMatch(/no student found/i);
  });

  it("reports an error when the Timelly ID is ambiguous across multiple students", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFindMany.mockResolvedValue([
      student1,
      { ...student1, id: "stu2", admissionNumber: "OTHER/10A-01" },
    ]);
    const res = await POST(
      postRequest({ rows: [{ timellyId: "10a-01", feeName: "Sports", amount: 100 }] })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.errors[0].message).toMatch(/multiple students match/i);
  });

  it("reports an error when the matched student has no fee record", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFindMany.mockResolvedValue([{ ...student1, fee: null }]);
    const res = await POST(
      postRequest({ rows: [{ timellyId: "10A-01", feeName: "Sports", amount: 100 }] })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.errors[0].message).toMatch(/no fee record/i);
  });

  it("rejects a duplicate fee name that already exists for the student in the DB", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockExtraFeeFindMany.mockResolvedValue([{ targetStudentId: "stu1", name: "Sports" }]);
    const res = await POST(
      postRequest({ rows: [{ timellyId: "10A-01", feeName: "Sports", amount: 100 }] })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBe(0);
    expect(json.errors[0].message).toMatch(/duplicate extra fee name/i);
  });

  it("rejects a fee name duplicated within the same upload", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(
      postRequest({
        rows: [
          { timellyId: "10A-01", feeName: "Sports", amount: 100 },
          { timellyId: "10A-01", feeName: "sports", amount: 200 },
        ],
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBe(1);
    expect(json.errors[0].message).toMatch(/repeated in upload/i);
  });

  it("creates the extra fee and increments the student's fee totals on success", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(
      postRequest({ rows: [{ timellyId: "10A-01", feeName: "Sports", amount: 500 }] })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBe(1);
    expect(json.failed).toBe(0);

    expect(mockExtraFeeCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          schoolId: "s1",
          name: "Sports",
          amount: 500,
          targetType: "STUDENT",
          targetStudentId: "stu1",
        }),
      ],
    });
    expect(mockStudentFeeUpdateMany).toHaveBeenCalledWith({
      where: { studentId: { in: ["stu1"] } },
      data: {
        totalFee: { increment: 500 },
        finalFee: { increment: 500 },
        remainingFee: { increment: 500 },
      },
    });
  });

  it("matches a student by the last segment of a slash-formatted admission number", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockStudentFindMany.mockResolvedValue([{ ...student1, rollNo: null }]);
    const res = await POST(
      postRequest({ rows: [{ timellyId: "001", feeName: "Sports", amount: 500 }] })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBe(1);
  });
});
