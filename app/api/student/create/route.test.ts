/**
 * @jest-environment node
 */
import { POST } from "@/app/api/student/create/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockUserUpdate = jest.fn();
const mockClassFindUnique = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockStudentApplicationFindFirst = jest.fn();
const mockTransaction = jest.fn();
const mockBcryptHash = jest.fn();
const mockUpsertStudentFeeFromStructure = jest.fn();
const mockComputeStudentTuitionTotalFee = jest.fn();
const mockSetApplicationEnrolled = jest.fn();
const mockInvalidateStudentListCaches = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("bcryptjs", () => ({
  hash: (...args: unknown[]) => mockBcryptHash(...args),
}));

jest.mock("@/lib/fees/studentTuitionFromStructure", () => ({
  upsertStudentFeeFromStructure: (...args: unknown[]) => mockUpsertStudentFeeFromStructure(...args),
  computeStudentTuitionTotalFee: (...args: unknown[]) => mockComputeStudentTuitionTotalFee(...args),
}));

jest.mock("@/lib/admission/admissionsListQuery", () => ({
  setApplicationEnrolled: (...args: unknown[]) => mockSetApplicationEnrolled(...args),
}));

jest.mock("@/lib/students/invalidateStudentListCaches", () => ({
  invalidateStudentListCaches: (...args: unknown[]) => mockInvalidateStudentListCaches(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
    class: { findUnique: (...args: unknown[]) => mockClassFindUnique(...args) },
    student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
    studentApplication: { findFirst: (...args: unknown[]) => mockStudentApplicationFindFirst(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/student/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: "Alice",
  fatherName: "Bob",
  aadhaarNo: "123456789012",
  phoneNo: "9876543210",
  dob: "2015-01-01",
  classId: "c1",
};

describe("POST /api/student/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockUserUpdate.mockReset();
    mockClassFindUnique.mockReset();
    mockStudentFindFirst.mockReset();
    mockStudentApplicationFindFirst.mockReset();
    mockTransaction.mockReset();
    mockBcryptHash.mockReset();
    mockUpsertStudentFeeFromStructure.mockReset();
    mockComputeStudentTuitionTotalFee.mockReset();
    mockInvalidateStudentListCaches.mockReset();
    mockBcryptHash.mockResolvedValue("hashed");
    mockClassFindUnique.mockResolvedValue({ id: "c1", schoolId: "s1" });
    mockStudentFindFirst.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no schoolId can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest({ ...validBody, name: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when dob is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest({ ...validBody, dob: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when classId is missing for an active student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest({ ...validBody, classId: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the class doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockClassFindUnique.mockResolvedValue({ id: "c1", schoolId: "other" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an aadhaar shorter than 12 digits", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest({ ...validBody, aadhaarNo: "123" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the aadhaar number already exists in the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue({ id: "existing" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("creates the student inside a transaction", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockComputeStudentTuitionTotalFee.mockResolvedValue(1000);
    mockTransaction.mockImplementation(async (fn) =>
      fn({
        school: { findUnique: jest.fn().mockResolvedValue({ name: "Greenwood" }) },
        schoolSettings: {
          findUnique: jest.fn().mockResolvedValue({ admissionPrefix: "ADM", rollNoPrefix: "", admissionCounter: 5 }),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({ admissionCounter: 6, admissionPrefix: "ADM" }),
        },
        student: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: "st1",
            admissionNumber: "ADM/2026/006",
            classId: "c1",
            user: { name: "Alice" },
            class: { name: "Grade 5", section: "A" },
          }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: "u2" }),
        },
        class: { findUnique: jest.fn().mockResolvedValue({ section: "A" }) },
        studentApplication: { create: jest.fn().mockResolvedValue({}) },
      })
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    expect(mockInvalidateStudentListCaches).toHaveBeenCalledWith("s1");
  });

  it("maps a Prisma P2002 aadhaarNo conflict to a friendly message", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTransaction.mockRejectedValue({ code: "P2002", meta: { target: ["aadhaarNo"] } });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/aadhaar/i);
  });

  it("returns 408 for a transaction timeout", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTransaction.mockRejectedValue({ code: "P1008", message: "transaction timeout" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(408);
  });

  it("returns 500 for a generic error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTransaction.mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
