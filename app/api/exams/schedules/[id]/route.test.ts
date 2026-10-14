/**
 * @jest-environment node
 */
import { GET, PUT, DELETE } from "@/app/api/exams/schedules/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockScheduleFindUnique = jest.fn();
const mockScheduleUpdate = jest.fn();
const mockScheduleDelete = jest.fn();
const mockSyllabusTrackingFindFirst = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: jest.fn() },
    school: { findFirst: jest.fn() },
    examSchedule: {
      findUnique: (...args: unknown[]) => mockScheduleFindUnique(...args),
      update: (...args: unknown[]) => mockScheduleUpdate(...args),
      delete: (...args: unknown[]) => mockScheduleDelete(...args),
    },
    syllabusTracking: { findFirst: (...args: unknown[]) => mockSyllabusTrackingFindFirst(...args) },
  },
}));

// GET's reads go through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md); PUT/DELETE still use the plain prisma import.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      examSchedule: { findUnique: (...args: unknown[]) => mockScheduleFindUnique(...args) },
      syllabusTracking: { findFirst: (...args: unknown[]) => mockSyllabusTrackingFindFirst(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeGetRequest() {
  return new Request("http://localhost/api/exams/schedules/sc1");
}
function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/exams/schedules/sc1", { method: "PUT", body: JSON.stringify(body) });
}
function makeDeleteRequest() {
  return new Request("http://localhost/api/exams/schedules/sc1", { method: "DELETE" });
}
const params = Promise.resolve({ id: "sc1" });

const scheduleRow = {
  id: "sc1",
  subject: "Math",
  examDate: new Date("2026-02-01"),
  startTime: "10:00",
  durationMin: 90,
  term: {
    id: "term1",
    schoolId: "s1",
    name: "Midterm",
    status: "UPCOMING",
    classId: "c1",
    class: { id: "c1", name: "Grade 5", section: "A" },
  },
};

describe("GET /api/exams/schedules/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockScheduleFindUnique.mockReset();
    mockSyllabusTrackingFindFirst.mockReset();
    mockSyllabusTrackingFindFirst.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the schedule doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockScheduleFindUnique.mockResolvedValue({ ...scheduleRow, term: { ...scheduleRow.term, schoolId: "s2" } });
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns the exam details", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockScheduleFindUnique.mockResolvedValue(scheduleRow);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.exam.subject).toBe("Math");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockScheduleFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/exams/schedules/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockScheduleFindUnique.mockReset();
    mockScheduleUpdate.mockReset();
  });

  it("returns 404 when the schedule isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockScheduleFindUnique.mockResolvedValue(null);
    const res = await PUT(makePutRequest({}), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid durationMin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockScheduleFindUnique.mockResolvedValue({ id: "sc1", term: { id: "term1", schoolId: "s1" } });
    const res = await PUT(
      makePutRequest({ subject: "Math", examDate: "2026-02-01", startTime: "10:00", durationMin: 0 }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("updates the schedule", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockScheduleFindUnique.mockResolvedValue({ id: "sc1", term: { id: "term1", schoolId: "s1" } });
    mockScheduleUpdate.mockResolvedValue({ id: "sc1" });
    const res = await PUT(
      makePutRequest({ subject: "Math", examDate: "2026-02-01", startTime: "10:00", durationMin: 60 }),
      { params }
    );
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockScheduleFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(
      makePutRequest({ subject: "Math", examDate: "2026-02-01", startTime: "10:00", durationMin: 60 }),
      { params }
    );
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/exams/schedules/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockScheduleFindUnique.mockReset();
    mockScheduleDelete.mockReset();
  });

  it("returns 404 when the schedule isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockScheduleFindUnique.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("deletes the schedule", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockScheduleFindUnique.mockResolvedValue({ id: "sc1", term: { id: "term1", schoolId: "s1" } });
    mockScheduleDelete.mockResolvedValue({ id: "sc1" });
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockScheduleFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(500);
  });
});
