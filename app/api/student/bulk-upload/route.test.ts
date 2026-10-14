/**
 * @jest-environment node
 */
import { POST } from "@/app/api/student/bulk-upload/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockUserUpdate = jest.fn();
const mockClassFindMany = jest.fn();
const mockSchoolFindUnique = jest.fn();
const mockSchoolSettingsFindUnique = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockBcryptHash = jest.fn();
const mockTransaction = jest.fn();
const mockUpsertStudentFeeFromStructure = jest.fn();
const mockReadFirstSheetRows = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("bcryptjs", () => ({
  hash: (...args: unknown[]) => mockBcryptHash(...args),
}));

jest.mock("@/lib/fees/studentTuitionFromStructure", () => ({
  upsertStudentFeeFromStructure: (...args: unknown[]) => mockUpsertStudentFeeFromStructure(...args),
}));

jest.mock("@/lib/excel/readWorkbookRows", () => ({
  readFirstSheetRows: (...args: unknown[]) => mockReadFirstSheetRows(...args),
  excelSerialToYmd: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: {
      findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args),
      findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args),
    },
    user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
    class: { findMany: (...args: unknown[]) => mockClassFindMany(...args) },
    schoolSettings: { findUnique: (...args: unknown[]) => mockSchoolSettingsFindUnique(...args) },
    student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

function makeRequest(file: File | null) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new Request("http://localhost/api/student/bulk-upload", { method: "POST", body: formData });
}

function makeFile() {
  return new File([new Uint8Array([1, 2, 3])], "students.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const validRow = {
  name: "Alice",
  fatherName: "Bob",
  phoneNo: "9876543210",
  aadhaarNo: "123456789012",
  dob: "2015-01-01",
};

describe("POST /api/student/bulk-upload", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockUserUpdate.mockReset();
    mockClassFindMany.mockReset();
    mockSchoolFindUnique.mockReset();
    mockSchoolSettingsFindUnique.mockReset();
    mockStudentFindFirst.mockReset();
    mockBcryptHash.mockReset();
    mockTransaction.mockReset();
    mockUpsertStudentFeeFromStructure.mockReset();
    mockReadFirstSheetRows.mockReset();

    mockClassFindMany.mockResolvedValue([]);
    mockSchoolFindUnique.mockResolvedValue({ name: "Greenwood" });
    mockSchoolSettingsFindUnique.mockResolvedValue({ emailDomain: null });
    mockBcryptHash.mockResolvedValue("hashed");
    mockStudentFindFirst.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no file is provided", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the sheet has no rows", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockReadFirstSheetRows.mockResolvedValue([]);
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(400);
  });

  it("records a failed row when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockReadFirstSheetRows.mockResolvedValue([{ name: "Alice" }]);
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failedCount).toBe(1);
    expect(json.createdCount).toBe(0);
  });

  it("creates a new student for a valid row", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockReadFirstSheetRows.mockResolvedValue([validRow]);
    mockTransaction.mockImplementation(async (fn) =>
      fn({
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: "u2" }),
          update: jest.fn(),
        },
        student: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: "st1" }),
          update: jest.fn(),
        },
        schoolSettings: {
          findUnique: jest.fn().mockResolvedValue({ admissionPrefix: "ADM", rollNoPrefix: "", admissionCounter: 5 }),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({ admissionCounter: 6, admissionPrefix: "ADM", rollNoPrefix: "" }),
        },
        class: { findUnique: jest.fn().mockResolvedValue(null) },
        studentFee: { findUnique: jest.fn().mockResolvedValue(null) },
      })
    );
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.createdCount).toBe(1);
    expect(json.failedCount).toBe(0);
  });

  it("records a failed row when the transaction throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockReadFirstSheetRows.mockResolvedValue([validRow]);
    mockTransaction.mockRejectedValue(new Error("Timelly number already used"));
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failedCount).toBe(1);
    expect(json.failed[0].error).toMatch(/Timelly number/);
  });

  it("returns 500 for an unexpected top-level error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(500);
  });
});
