/**
 * @jest-environment node
 */
import { GET } from "@/app/api/marks/view/route";

const mockGetServerSession = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockMarkFindMany = jest.fn();
const mockMarkFindFirst = jest.fn();
const mockSwrRead = jest.fn();
const mockSwrWrite = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    mark: {
      findMany: (...args: unknown[]) => mockMarkFindMany(...args),
      findFirst: (...args: unknown[]) => mockMarkFindFirst(...args),
    },
  },
}));

jest.mock("@/lib/parent/parentPortalSwr", () => ({
  parentPortalSwrRead: (...args: unknown[]) => mockSwrRead(...args),
  parentPortalSwrWrite: (...args: unknown[]) => mockSwrWrite(...args),
  PARENT_LIST_TTL: 60,
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      mark: {
        findMany: (...args: unknown[]) => mockMarkFindMany(...args),
        findFirst: (...args: unknown[]) => mockMarkFindFirst(...args),
      },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/marks/view${query}`);
}

describe("GET /api/marks/view", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindUnique.mockReset();
    mockMarkFindMany.mockReset();
    mockMarkFindFirst.mockReset();
    mockSwrRead.mockReset();
    mockSwrWrite.mockReset();
    mockSwrRead.mockResolvedValue({ value: null });
    mockSwrWrite.mockResolvedValue(undefined);
    mockMarkFindMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("scopes to the student's own marks", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockMarkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentId: "st1" }) })
    );
  });

  it("returns a cached payload for a student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    mockSwrRead.mockResolvedValue({ value: { marks: [{ id: "cached" }] } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.marks).toEqual([{ id: "cached" }]);
    expect(mockMarkFindMany).not.toHaveBeenCalled();
  });

  it("aggregates examTypesInUse for staff with a classId filter", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockMarkFindMany
      .mockResolvedValueOnce([{ id: "m1" }])
      .mockResolvedValueOnce([{ examType: "MIDTERM" }]);
    mockMarkFindFirst.mockResolvedValue({ examType: "MIDTERM" });
    const res = await GET(makeRequest("?classId=c1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.examTypesInUse).toEqual(["MIDTERM"]);
    expect(json.latestExamType).toBe("MIDTERM");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockMarkFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
