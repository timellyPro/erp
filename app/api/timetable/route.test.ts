/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/timetable/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockClassFindFirst = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockTimetableFindMany = jest.fn();
const mockTimetableFindFirst = jest.fn();
const mockTimetableUpsert = jest.fn();
const mockTimetableEntryDeleteMany = jest.fn();
const mockTimetableEntryCreateMany = jest.fn();
const mockUserFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: {
      findUnique: (...args: unknown[]) => mockStudentFindUnique(...args),
      findFirst: (...args: unknown[]) => mockStudentFindFirst(...args),
    },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    timetable: {
      findMany: (...args: unknown[]) => mockTimetableFindMany(...args),
      findFirst: (...args: unknown[]) => mockTimetableFindFirst(...args),
      upsert: (...args: unknown[]) => mockTimetableUpsert(...args),
    },
    timetableEntry: {
      deleteMany: (...args: unknown[]) => mockTimetableEntryDeleteMany(...args),
      createMany: (...args: unknown[]) => mockTimetableEntryCreateMany(...args),
    },
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
  },
}));

// GET's reads go through the app_tenant-connected, RLS-restricted client
// (docs/SECURITY_REVIEW.md); POST still uses the plain prisma import.
const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
      class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
      timetable: {
        findMany: (...args: unknown[]) => mockTimetableFindMany(...args),
        findFirst: (...args: unknown[]) => mockTimetableFindFirst(...args),
      },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeGetRequest(query = "") {
  return new Request(`http://localhost/api/timetable${query}`);
}
function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/timetable", { method: "POST", body: JSON.stringify(body) });
}

const validEntries = [
  { dayOfWeek: 1, startTime: "09:00", endTime: "10:00", title: "Math" },
];

describe("GET /api/timetable", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindUnique.mockReset();
    mockStudentFindFirst.mockReset();
    mockClassFindFirst.mockReset();
    mockSchoolFindFirst.mockReset();
    mockTimetableFindMany.mockReset();
    mockTimetableFindFirst.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
  });

  it("returns all timetables for staff when all=1", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockTimetableFindMany.mockResolvedValue([{ id: "tt1" }]);
    const res = await GET(makeGetRequest("?all=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.timetables).toHaveLength(1);
  });

  it("returns null timetable when no class can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.timetable).toBeNull();
  });

  it("returns the class timetable for a student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1", studentId: "st1" } });
    mockStudentFindFirst.mockResolvedValue({ classId: "c1" });
    mockTimetableFindFirst.mockResolvedValue({ id: "tt1", classId: "c1" });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.classId).toBe("c1");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

describe("POST /api/timetable", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindFirst.mockReset();
    mockSchoolFindFirst.mockReset();
    mockTimetableUpsert.mockReset();
    mockTimetableEntryDeleteMany.mockReset();
    mockTimetableEntryCreateMany.mockReset();
    mockUserFindMany.mockReset();
  });

  it("returns 403 for a role without write access", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await POST(makePostRequest({ classId: "c1", entries: validEntries }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when classId is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await POST(makePostRequest({ entries: validEntries }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the class doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await POST(makePostRequest({ classId: "c1", entries: validEntries }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when there are no valid entries", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1", name: "Grade 5", section: "A" });
    const res = await POST(makePostRequest({ classId: "c1", entries: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a referenced teacher is invalid", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1", name: "Grade 5", section: "A" });
    mockUserFindMany.mockResolvedValue([]);
    const res = await POST(
      makePostRequest({ classId: "c1", entries: [{ ...validEntries[0], teacherId: "t1" }] })
    );
    expect(res.status).toBe(400);
  });

  it("saves the timetable and its entries", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue({ id: "c1", name: "Grade 5", section: "A" });
    mockTimetableUpsert.mockResolvedValue({ id: "tt1" });
    const res = await POST(makePostRequest({ classId: "c1", entries: validEntries }));
    expect(res.status).toBe(200);
    expect(mockTimetableEntryDeleteMany).toHaveBeenCalled();
    expect(mockTimetableEntryCreateMany).toHaveBeenCalled();
  });

  it("allows a teacher with the timetable-manage feature", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "t1", role: "TEACHER", schoolId: "s1", allowedFeatures: ["timetable-manage"] },
    });
    mockClassFindFirst.mockResolvedValue({ id: "c1", name: "Grade 5", section: "A" });
    mockTimetableUpsert.mockResolvedValue({ id: "tt1" });
    const res = await POST(makePostRequest({ classId: "c1", entries: validEntries }));
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makePostRequest({ classId: "c1", entries: validEntries }));
    expect(res.status).toBe(500);
  });
});
