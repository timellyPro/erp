/**
 * @jest-environment node
 */
import * as XLSX from "xlsx";
import { POST } from "@/app/api/fees/structure/bulk/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockClassFindMany = jest.fn();
const mockSaveClassFeeStructureAndSyncStudents = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/fees/classFeeStructureApply", () => ({
  saveClassFeeStructureAndSyncStudents: (...args: unknown[]) =>
    mockSaveClassFeeStructureAndSyncStudents(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findMany: (...args: unknown[]) => mockClassFindMany(...args) },
  },
}));

function bufferFromRows(rows: Record<string, unknown>[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function requestWithRows(rows: Record<string, unknown>[]): Request {
  const buffer = new Uint8Array(bufferFromRows(rows));
  const file = new File([buffer], "structure.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const formData = new FormData();
  formData.set("file", file);
  return new Request("http://localhost/api/fees/structure/bulk", {
    method: "POST",
    body: formData,
  });
}

function requestWithoutFile(): Request {
  const formData = new FormData();
  return new Request("http://localhost/api/fees/structure/bulk", {
    method: "POST",
    body: formData,
  });
}

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const classes = [
  { id: "c1", name: "5", section: "A" },
  { id: "c2", name: "6", section: "B" },
];

describe("POST /api/fees/structure/bulk", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockClassFindMany.mockReset().mockResolvedValue(classes);
    mockSaveClassFeeStructureAndSyncStudents.mockReset().mockResolvedValue({ structure: {} });
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(requestWithoutFile());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await POST(requestWithoutFile());
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await POST(requestWithoutFile());
    expect(res.status).toBe(400);
  });

  it("returns 400 when no file is uploaded", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(requestWithoutFile());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/excel file required/i);
  });

  it("returns 400 when the sheet is empty", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(requestWithRows([]));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/excel sheet is empty/i);
  });

  it("returns 400 when no valid data rows are found (unmatched columns)", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(requestWithRows([{ Foo: "bar" }]));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/no valid data rows found/i);
  });

  it("skips rows whose class name starts with '*' (instruction/comment rows)", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(
      requestWithRows([{ ClassName: "* Instructions", Section: "", ComponentName: "", Amount: "" }])
    );
    expect(res.status).toBe(400);
    expect(mockSaveClassFeeStructureAndSyncStudents).not.toHaveBeenCalled();
  });

  it("reports a failure row when the class/section does not match any class", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(
      requestWithRows([{ ClassName: "9", Section: "Z", ComponentName: "Tuition", Amount: 1000 }])
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updatedClasses).toBe(0);
    expect(json.failed).toHaveLength(1);
    expect(json.failed[0].message).toMatch(/no class matches/i);
  });

  it("reports a failure row when the amount is missing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(
      requestWithRows([{ ClassName: "5", Section: "A", ComponentName: "Tuition", Amount: "" }])
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failed[0].message).toMatch(/amount is missing/i);
  });

  it("saves the class fee structure and merges duplicate component names, keeping the last amount", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(
      requestWithRows([
        { ClassName: "5", Section: "A", ComponentName: "Tuition", Amount: 1000 },
        { ClassName: "5", Section: "A", ComponentName: "Lab", Amount: 200 },
        { ClassName: "5", Section: "A", ComponentName: "Tuition", Amount: 1200 },
      ])
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.updatedClasses).toBe(1);
    expect(json.updated[0]).toMatchObject({ classId: "c1", label: "Class 5-A", components: 2 });

    expect(mockSaveClassFeeStructureAndSyncStudents).toHaveBeenCalledWith({
      schoolId: "s1",
      classId: "c1",
      components: [
        { name: "Tuition", amount: 1200 },
        { name: "Lab", amount: 200 },
      ],
    });
  });

  it("records a failure entry when saving a class's structure throws", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockSaveClassFeeStructureAndSyncStudents.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(
      requestWithRows([{ ClassName: "5", Section: "A", ComponentName: "Tuition", Amount: 1000 }])
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updatedClasses).toBe(0);
    expect(json.failed[0].message).toMatch(/DB exploded/);
  });
});
