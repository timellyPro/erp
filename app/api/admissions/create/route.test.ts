/**
 * @jest-environment node
 */
import { POST } from "@/app/api/admissions/create/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockClassFindUnique = jest.fn();
const mockStudentApplicationCreate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    class: { findUnique: (...args: unknown[]) => mockClassFindUnique(...args) },
    studentApplication: { create: (...args: unknown[]) => mockStudentApplicationCreate(...args) },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admissions/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  applicationNo: "APP/2026/001",
  firstName: "Alice",
  lastName: "Smith",
  dateOfBirth: "2015-01-01",
  nationality: "Indian",
  languagesAtHome: "English",
  houseNo: "1",
  street: "Main St",
  city: "City",
  state: "State",
  pinCode: "123456",
  parentName: "Bob Smith",
  parentOccupation: "Engineer",
  officeAddress: "Office",
  parentPhone: "9876543210",
  parentWhatsapp: "9876543210",
};

describe("POST /api/admissions/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockClassFindUnique.mockReset();
    mockStudentApplicationCreate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that can't manage admissions", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a required field is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await POST(makeRequest({ ...validBody, firstName: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the given classId doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindUnique.mockResolvedValue({ id: "c1", schoolId: "other" });
    const res = await POST(makeRequest({ ...validBody, classId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid dateOfBirth", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await POST(makeRequest({ ...validBody, dateOfBirth: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("creates the application", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationCreate.mockResolvedValue({ id: "app1", applicationNo: "APP/2026/001", createdAt: new Date() });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
  });

  it("maps a Prisma P2002 error to a duplicate-value message", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationCreate.mockRejectedValue({ code: "P2002", meta: { target: ["applicationNo"] } });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/duplicate/i);
  });

  it("returns 500 for a generic error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockStudentApplicationCreate.mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
