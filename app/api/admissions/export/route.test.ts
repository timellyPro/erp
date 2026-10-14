/**
 * @jest-environment node
 */
import { GET } from "@/app/api/admissions/export/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockStudentApplicationFindMany = jest.fn();
const mockHasWorkflowColumn = jest.fn();
const mockAdmissionListWhereSql = jest.fn();
const mockAdmissionRawIdsPage = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/admission/admissionsListQuery", () => ({
  admissionListWhereSql: (...args: unknown[]) => mockAdmissionListWhereSql(...args),
  admissionRawIdsPage: (...args: unknown[]) => mockAdmissionRawIdsPage(...args),
  studentApplicationHasWorkflowColumn: (...args: unknown[]) => mockHasWorkflowColumn(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    studentApplication: { findMany: (...args: unknown[]) => mockStudentApplicationFindMany(...args) },
  },
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/admissions/export${query}`);
}

const sampleRow = {
  id: "app1",
  applicationNo: "APP/2026/001",
  fedenaNo: null,
  admissionNo: null,
  gradeSought: "GRADE_1",
  boardingType: "SEMI_RESIDENTIAL",
  residencyType: "Day Scholar",
  rollNo: "1",
  firstName: "Alice",
  middleName: null,
  lastName: "Smith",
  aadharNo: "123456789012",
  gender: "FEMALE",
  dateOfBirth: new Date("2015-01-01"),
  firstLanguage: "English",
  previousSchoolName: "-",
  previousSchoolAddress: "-",
  className: null,
  section: null,
  class: null,
  totalFee: null,
  discountPercent: null,
  applicationFee: 200,
  admissionFee: 300,
  applicationFeePaid: true,
  admissionFeePaid: false,
  nationality: "Indian",
  languagesAtHome: "English",
  caste: null,
  religion: null,
  parentName: "Bob Smith",
  parentOccupation: "Engineer",
  officeAddress: "Office",
  parentPhone: "9876543210",
  parentEmail: "-",
  parentAadharNo: "123456780000",
  parentWhatsapp: "9876543210",
  bankAccountNo: "-",
  emergencyFatherNo: "-",
  emergencyMotherNo: "-",
  emergencyGuardianNo: "-",
  houseNo: "1",
  street: "Main St",
  city: "City",
  town: null,
  state: "State",
  pinCode: "123456",
  createdAt: new Date("2026-01-01"),
};

describe("GET /api/admissions/export", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockStudentApplicationFindMany.mockReset();
    mockHasWorkflowColumn.mockReset();
    mockAdmissionListWhereSql.mockReset();
    mockAdmissionRawIdsPage.mockReset();
    mockStudentApplicationFindMany.mockResolvedValue([sampleRow]);
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

  it("returns an xlsx attachment by default", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
  });

  it("returns a csv attachment for format=csv", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await GET(makeRequest("?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("Alice");
  });

  it("returns printable HTML for format=print", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await GET(makeRequest("?format=print"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Admissions Register");
  });

  it("uses the raw-SQL pipeline to filter for phase=pending", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockAdmissionListWhereSql.mockReturnValue("SQL");
    mockAdmissionRawIdsPage.mockResolvedValue(["app1"]);
    const res = await GET(makeRequest("?phase=pending&format=csv"));
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
