/**
 * @jest-environment node
 */
import { GET, PUT } from "@/app/api/student/parent-details/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockStudentUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: {
      findFirst: (...args: unknown[]) => mockStudentFindFirst(...args),
      update: (...args: unknown[]) => mockStudentUpdate(...args),
    },
  },
}));

const putRequest = (body: unknown) =>
  new Request("http://localhost/api/student/parent-details", { method: "PUT", body: JSON.stringify(body) });

const session = { user: { id: "u1" } };

describe("GET /api/student/parent-details", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindFirst.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty values when the user has no linked student record", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ address: "", fatherName: "", motherName: "", occupation: "", fatherPhone: "" });
  });

  it("maps the student's fields, defaulting nulls to empty strings", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockResolvedValue({
      address: "123 Main St",
      fatherName: null,
      motherName: "Jane",
      occupation: null,
      phoneNo: "9999999999",
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      address: "123 Main St",
      fatherName: "",
      motherName: "Jane",
      occupation: "",
      fatherPhone: "9999999999",
    });
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/student/parent-details", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindFirst.mockReset();
    mockStudentUpdate.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(putRequest({ address: "New" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user has no linked student record", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await PUT(putRequest({ address: "New" }));
    expect(res.status).toBe(404);
  });

  it("updates only the fields present in the body, mapping fatherPhone to phoneNo", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockResolvedValue({ id: "stu1" });
    mockStudentUpdate.mockResolvedValue({});

    const res = await PUT(putRequest({ address: "New Address", fatherPhone: "8888888888" }));
    expect(res.status).toBe(200);
    expect(mockStudentUpdate).toHaveBeenCalledWith({
      where: { id: "stu1" },
      data: { address: "New Address", phoneNo: "8888888888" },
    });
  });

  it("nulls out an explicitly empty string field", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockResolvedValue({ id: "stu1" });
    mockStudentUpdate.mockResolvedValue({});

    await PUT(putRequest({ occupation: "" }));
    expect(mockStudentUpdate).toHaveBeenCalledWith({
      where: { id: "stu1" },
      data: { occupation: null },
    });
  });

  it("returns 500 when the update throws", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindFirst.mockResolvedValue({ id: "stu1" });
    mockStudentUpdate.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(putRequest({ address: "New" }));
    expect(res.status).toBe(500);
  });
});
