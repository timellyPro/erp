/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/exams/units/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSyllabusUnitFindFirst = jest.fn();
const mockSyllabusUnitUpdate = jest.fn();
const mockSyllabusUnitFindMany = jest.fn();
const mockSyllabusTrackingUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    syllabusUnit: {
      findFirst: (...args: unknown[]) => mockSyllabusUnitFindFirst(...args),
      update: (...args: unknown[]) => mockSyllabusUnitUpdate(...args),
      findMany: (...args: unknown[]) => mockSyllabusUnitFindMany(...args),
    },
    syllabusTracking: { update: (...args: unknown[]) => mockSyllabusTrackingUpdate(...args) },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/exams/units/u1", { method: "PATCH", body: JSON.stringify(body) });
}
const params = Promise.resolve({ id: "u1" });

describe("PATCH /api/exams/units/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSyllabusUnitFindFirst.mockReset();
    mockSyllabusUnitFindFirst.mockResolvedValue({ id: "u1" });
    mockSyllabusUnitUpdate.mockReset();
    mockSyllabusUnitFindMany.mockReset();
    mockSyllabusTrackingUpdate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({}), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a disallowed role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await PATCH(makeRequest({}), { params });
    expect(res.status).toBe(403);
  });

  it("updates the unit and recalculates the tracking average", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "sch1" } });
    mockSyllabusUnitUpdate.mockResolvedValue({ id: "u1", trackingId: "tr1", completedPercent: 80 });
    mockSyllabusUnitFindMany.mockResolvedValue([{ completedPercent: 80 }, { completedPercent: 60 }]);
    mockSyllabusTrackingUpdate.mockResolvedValue({});
    const res = await PATCH(makeRequest({ completedPercent: 80 }), { params });
    expect(res.status).toBe(200);
    expect(mockSyllabusTrackingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tr1" }, data: { completedPercent: 70 } })
    );
  });

  it("clamps completedPercent to [0, 100]", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "sch1" } });
    mockSyllabusUnitUpdate.mockResolvedValue({ id: "u1", trackingId: "tr1" });
    mockSyllabusUnitFindMany.mockResolvedValue([]);
    const res = await PATCH(makeRequest({ completedPercent: -20 }), { params });
    expect(res.status).toBe(200);
    expect(mockSyllabusUnitUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { completedPercent: 0 } })
    );
  });

  it("scopes the unit lookup to the caller's school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "sch1" } });
    mockSyllabusUnitUpdate.mockResolvedValue({ id: "u1", trackingId: "tr1" });
    mockSyllabusUnitFindMany.mockResolvedValue([]);
    await PATCH(makeRequest({ completedPercent: 10 }), { params });
    expect(mockSyllabusUnitFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1", tracking: { term: { schoolId: "sch1" } } } })
    );
  });

  it("returns 404 and does not write when the unit belongs to another school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "sch1" } });
    mockSyllabusUnitFindFirst.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ completedPercent: 99 }), { params });
    expect(res.status).toBe(404);
    expect(mockSyllabusUnitUpdate).not.toHaveBeenCalled();
    expect(mockSyllabusTrackingUpdate).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: "sch1" } });
    mockSyllabusUnitUpdate.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH(makeRequest({ completedPercent: 50 }), { params });
    expect(res.status).toBe(500);
  });
});
