/**
 * @jest-environment node
 */
import { GET, PUT } from "@/app/api/user/me/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserUpdate = jest.fn();
const mockClassFindMany = jest.fn();
const mockGetTeacherAccessibleClassIds = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/teacher/teacherClassAccess", () => ({
  getTeacherAccessibleClassIds: (...args: unknown[]) => mockGetTeacherAccessibleClassIds(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    class: { findMany: (...args: unknown[]) => mockClassFindMany(...args) },
  },
}));

const putRequest = (body: unknown) =>
  new Request("http://localhost/api/user/me", { method: "PUT", body: JSON.stringify(body) });

const session = { user: { id: "u1", schoolId: "s1" } };

const baseUser = {
  id: "u1",
  name: "Admin One",
  email: "admin@example.com",
  mobile: null,
  address: null,
  qualification: null,
  experience: null,
  language: null,
  photoUrl: null,
  teacherId: null,
  subject: null,
  subjects: [],
  teachingClassIds: ["c1"],
  createdAt: new Date("2024-01-01"),
  assignedClasses: [{ id: "c1", name: "5", section: "A", _count: { students: 10 } }],
  role: "SCHOOLADMIN",
};

describe("GET /api/user/me", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserFindUnique.mockReset();
    mockClassFindMany.mockReset();
    mockGetTeacherAccessibleClassIds.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user is not found", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserFindUnique.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("returns the user with assignedClassIds derived from teachingClassIds for non-teachers", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserFindUnique.mockResolvedValue(baseUser);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.assignedClassIds).toEqual(["c1"]);
    expect(json.user.assignedClasses).toEqual(baseUser.assignedClasses);
    expect(mockGetTeacherAccessibleClassIds).not.toHaveBeenCalled();
  });

  it("recomputes assignedClasses from accessible class ids for a TEACHER", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserFindUnique.mockResolvedValue({ ...baseUser, role: "TEACHER" });
    mockGetTeacherAccessibleClassIds.mockResolvedValue(["c1", "c2"]);
    mockClassFindMany.mockResolvedValue([
      { id: "c1", name: "5", section: "A", _count: { students: 10 } },
      { id: "c2", name: "6", section: "B", _count: { students: 8 } },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.assignedClasses).toHaveLength(2);
    expect(mockGetTeacherAccessibleClassIds).toHaveBeenCalledWith("u1", "s1");
  });

  it("returns an empty assignedClasses list for a TEACHER with no accessible classes", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserFindUnique.mockResolvedValue({ ...baseUser, role: "TEACHER" });
    mockGetTeacherAccessibleClassIds.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.assignedClasses).toEqual([]);
    expect(mockClassFindMany).not.toHaveBeenCalled();
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/user/me", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserUpdate.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(putRequest({ mobile: "9999999999" }));
    expect(res.status).toBe(401);
  });

  it("updates only the fields present in the body", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserUpdate.mockResolvedValue({ ...baseUser, mobile: "9999999999" });

    const res = await PUT(putRequest({ mobile: "9999999999" }));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { mobile: "9999999999" },
      select: expect.anything(),
    });
  });

  it("trims string values and nulls out empty strings", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserUpdate.mockResolvedValue(baseUser);

    await PUT(putRequest({ address: "  ", qualification: "  B.Ed  " }));
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { address: null, qualification: "B.Ed" },
      select: expect.anything(),
    });
  });

  it("passes through null values explicitly for nullable fields", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserUpdate.mockResolvedValue(baseUser);

    await PUT(putRequest({ photoUrl: null, name: null }));
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { photoUrl: null, name: null },
      select: expect.anything(),
    });
  });

  it("ignores fields with the wrong type", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserUpdate.mockResolvedValue(baseUser);

    await PUT(putRequest({ mobile: 12345 }));
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: {},
      select: expect.anything(),
    });
  });

  it("returns 500 when the update throws", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserUpdate.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(putRequest({ mobile: "9999999999" }));
    expect(res.status).toBe(500);
  });
});
