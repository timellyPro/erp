/**
 * @jest-environment node
 */
import { POST } from "@/app/api/exams/terms/[id]/syllabus/units/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockExamTermFindFirst = jest.fn();
const mockSyllabusTrackingUpsert = jest.fn();
const mockSyllabusUnitCreate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: jest.fn() },
    school: { findFirst: jest.fn() },
    examTerm: { findFirst: (...args: unknown[]) => mockExamTermFindFirst(...args) },
    syllabusTracking: { upsert: (...args: unknown[]) => mockSyllabusTrackingUpsert(...args) },
    syllabusUnit: { create: (...args: unknown[]) => mockSyllabusUnitCreate(...args) },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/exams/terms/term1/syllabus/units", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "term1" });

describe("POST /api/exams/terms/[id]/syllabus/units", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTermFindFirst.mockReset();
    mockSyllabusTrackingUpsert.mockReset();
    mockSyllabusUnitCreate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the term isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({ subject: "Math", unitName: "Algebra" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when subject or unitName is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    const res = await POST(makeRequest({ subject: "Math" }), { params });
    expect(res.status).toBe(400);
  });

  it("creates the unit under an upserted tracking record", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    mockSyllabusTrackingUpsert.mockResolvedValue({ id: "tr1" });
    mockSyllabusUnitCreate.mockResolvedValue({ id: "u1", unitName: "Algebra" });
    const res = await POST(makeRequest({ subject: "Math", unitName: "Algebra", order: 1 }), { params });
    expect(res.status).toBe(201);
    expect(mockSyllabusUnitCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ trackingId: "tr1", unitName: "Algebra" }) })
    );
  });

  it("maps a Prisma P2021 error to a migration-needed message", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    mockSyllabusTrackingUpsert.mockRejectedValue({ code: "P2021" });
    const res = await POST(makeRequest({ subject: "Math", unitName: "Algebra" }), { params });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toMatch(/migrate/i);
  });

  it("returns 500 for a generic database error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ subject: "Math", unitName: "Algebra" }), { params });
    expect(res.status).toBe(500);
  });
});
