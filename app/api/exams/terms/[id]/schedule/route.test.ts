/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/exams/terms/[id]/schedule/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockExamTermFindFirst = jest.fn();
const mockExamScheduleFindMany = jest.fn();
const mockExamScheduleCreate = jest.fn();

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
    examSchedule: {
      create: (...args: unknown[]) => mockExamScheduleCreate(...args),
    },
  },
}));

// GET's reads go through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md); POST still uses the plain prisma import.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      examTerm: { findFirst: (...args: unknown[]) => mockExamTermFindFirst(...args) },
      examSchedule: { findMany: (...args: unknown[]) => mockExamScheduleFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeGetRequest() {
  return new Request("http://localhost/api/exams/terms/term1/schedule");
}
function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/exams/terms/term1/schedule", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "term1" });

const validBody = { subject: "Math", examDate: "2026-02-01", startTime: "10:00", durationMin: 90 };

describe("GET /api/exams/terms/[id]/schedule", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTermFindFirst.mockReset();
    mockExamScheduleFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the term isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns the term's schedules", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    mockExamScheduleFindMany.mockResolvedValue([{ id: "sc1" }]);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/exams/terms/[id]/schedule", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTermFindFirst.mockReset();
    mockExamScheduleCreate.mockReset();
  });

  it("returns 404 when the term isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue(null);
    const res = await POST(makePostRequest(validBody), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when required fields are missing/invalid", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    const res = await POST(makePostRequest({ subject: "Math" }), { params });
    expect(res.status).toBe(400);
  });

  it("creates the schedule", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    mockExamScheduleCreate.mockResolvedValue({ id: "sc1" });
    const res = await POST(makePostRequest(validBody), { params });
    expect(res.status).toBe(201);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makePostRequest(validBody), { params });
    expect(res.status).toBe(500);
  });
});
