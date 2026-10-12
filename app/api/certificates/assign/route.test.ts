/**
 * @jest-environment node
 */
import { POST } from "@/app/api/certificates/assign/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockTemplateFindFirst = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockEventFindFirst = jest.fn();
const mockCertificateCreate = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    certificateTemplate: { findFirst: (...args: unknown[]) => mockTemplateFindFirst(...args) },
    student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
    event: { findFirst: (...args: unknown[]) => mockEventFindFirst(...args) },
    certificate: { create: (...args: unknown[]) => mockCertificateCreate(...args) },
  },
}));

jest.mock("@/lib/notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/certificates/assign", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = { templateId: "tpl1", studentId: "st1", title: "Achievement" };

describe("POST /api/certificates/assign", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockTemplateFindFirst.mockReset();
    mockStudentFindFirst.mockReset();
    mockEventFindFirst.mockReset();
    mockCertificateCreate.mockReset();
    mockCreateNotification.mockReset();
    mockCreateNotification.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest({ templateId: "tpl1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the template doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTemplateFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the student doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTemplateFindFirst.mockResolvedValue({ id: "tpl1" });
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the given event doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTemplateFindFirst.mockResolvedValue({ id: "tpl1" });
    mockStudentFindFirst.mockResolvedValue({ id: "st1" });
    mockEventFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({ ...validBody, eventId: "ev1" }));
    expect(res.status).toBe(404);
  });

  it("creates the certificate and notifies the student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTemplateFindFirst.mockResolvedValue({ id: "tpl1" });
    mockStudentFindFirst.mockResolvedValue({ id: "st1" });
    mockCertificateCreate.mockResolvedValue({
      id: "cert1",
      student: { user: { id: "stu-user1" } },
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "stu-user1",
      "CERTIFICATES",
      expect.any(String),
      expect.any(String)
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockTemplateFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
