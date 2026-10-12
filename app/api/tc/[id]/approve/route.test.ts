/**
 * @jest-environment node
 */
import { POST } from "@/app/api/tc/[id]/approve/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockTcFindFirst = jest.fn();
const mockTransaction = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    transferCertificate: { findFirst: (...args: unknown[]) => mockTcFindFirst(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

jest.mock("@/lib/notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

function makeRequest(body: unknown = {}) {
  return new Request("http://localhost/api/tc/tc1/approve", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "tc1" });

const baseTc = {
  id: "tc1",
  status: "PENDING",
  reason: "moving",
  student: {
    id: "st1",
    userId: "stu-user1",
    schoolId: "s1",
    classId: "c1",
    fatherName: "F",
    aadhaarNo: null,
    phoneNo: null,
    rollNo: "1",
    dob: null,
    address: null,
    createdAt: new Date("2026-01-01"),
  },
};

describe("POST /api/tc/[id]/approve", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockTcFindFirst.mockReset();
    mockTransaction.mockReset();
    mockCreateNotification.mockReset();
    mockCreateNotification.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the TC doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTcFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when the TC is not pending", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTcFindFirst.mockResolvedValue({ ...baseTc, status: "APPROVED" });
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(400);
  });

  it("approves a pending TC, runs the transaction, and notifies the student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTcFindFirst.mockResolvedValue(baseTc);
    mockTransaction.mockImplementation(async (fn) =>
      fn({
        transferCertificate: { update: jest.fn().mockResolvedValue({ id: "tc1", status: "APPROVED" }) },
        studentHistory: { create: jest.fn().mockResolvedValue({}) },
        student: { update: jest.fn().mockResolvedValue({}) },
      })
    );
    const res = await POST(makeRequest({ tcDocumentUrl: "https://x/doc.pdf" }), { params });
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "stu-user1",
      "CERTIFICATES",
      expect.any(String),
      expect.any(String)
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTcFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(500);
  });
});
