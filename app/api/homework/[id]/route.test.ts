/**
 * @jest-environment node
 */
import { PUT, DELETE } from "@/app/api/homework/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockClassFindFirst = jest.fn();
const mockHomeworkFindFirst = jest.fn();
const mockHomeworkUpdate = jest.fn();
const mockHomeworkDelete = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    homework: {
      findFirst: (...args: unknown[]) => mockHomeworkFindFirst(...args),
      update: (...args: unknown[]) => mockHomeworkUpdate(...args),
      delete: (...args: unknown[]) => mockHomeworkDelete(...args),
    },
  },
}));

function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/homework/hw1", { method: "PUT", body: JSON.stringify(body) });
}
function makeDeleteRequest() {
  return new Request("http://localhost/api/homework/hw1", { method: "DELETE" });
}

const context = { params: Promise.resolve({ id: "hw1" }) };

describe("PUT /api/homework/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindFirst.mockReset();
    mockHomeworkFindFirst.mockReset();
    mockHomeworkUpdate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(makePutRequest({}), context);
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest({}), context);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the homework isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockHomeworkFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ title: "Updated" }), context);
    expect(res.status).toBe(404);
  });

  it("returns 400 when the new classId doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockHomeworkFindFirst.mockResolvedValue({ id: "hw1" });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ classId: "c2" }), context);
    expect(res.status).toBe(400);
  });

  it("updates the homework", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockHomeworkFindFirst.mockResolvedValue({ id: "hw1" });
    mockHomeworkUpdate.mockResolvedValue({ id: "hw1", title: "Updated" });
    const res = await PUT(makePutRequest({ title: "Updated" }), context);
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockHomeworkFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(makePutRequest({ title: "Updated" }), context);
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/homework/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindFirst.mockReset();
    mockHomeworkFindFirst.mockReset();
    mockHomeworkDelete.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), context);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the homework isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockHomeworkFindFirst.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), context);
    expect(res.status).toBe(404);
  });

  it("deletes the homework", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockHomeworkFindFirst.mockResolvedValue({ id: "hw1" });
    mockHomeworkDelete.mockResolvedValue({ id: "hw1" });
    const res = await DELETE(makeDeleteRequest(), context);
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockHomeworkFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await DELETE(makeDeleteRequest(), context);
    expect(res.status).toBe(500);
  });
});
