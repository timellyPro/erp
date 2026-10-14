/**
 * @jest-environment node
 */
import { PUT, DELETE } from "@/app/api/newsfeed/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockQueryRawUnsafe = jest.fn();
const mockExecuteRawUnsafe = jest.fn();
const mockNewsFeedUpdate = jest.fn();
const mockNewsFeedDelete = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    newsFeed: {
      update: (...args: unknown[]) => mockNewsFeedUpdate(...args),
      delete: (...args: unknown[]) => mockNewsFeedDelete(...args),
    },
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
  },
}));

const ctx = { params: Promise.resolve({ id: "nf1" }) };
const putRequest = (body: unknown) =>
  new Request("http://localhost/api/newsfeed/nf1", { method: "PUT", body: JSON.stringify(body) });
const deleteRequest = () => new Request("http://localhost/api/newsfeed/nf1", { method: "DELETE" });

const session = { user: { id: "u1", schoolId: "s1" } };

describe("PUT /api/newsfeed/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockQueryRawUnsafe.mockReset();
    mockExecuteRawUnsafe.mockReset().mockResolvedValue(undefined);
    mockNewsFeedUpdate.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(putRequest({ title: "New" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 when the session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await PUT(putRequest({ title: "New" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the feed does not belong to the caller's school", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockQueryRawUnsafe.mockResolvedValue([]);
    const res = await PUT(putRequest({ title: "New" }), ctx);
    expect(res.status).toBe(404);
  });

  it("updates the feed via Prisma", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockQueryRawUnsafe.mockResolvedValue([{ id: "nf1" }]);
    mockNewsFeedUpdate.mockResolvedValue({ id: "nf1", title: "New Title" });

    const res = await PUT(putRequest({ title: "New Title" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newsFeed.title).toBe("New Title");
    expect(mockNewsFeedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "nf1" }, data: { title: "New Title" } })
    );
  });

  it("falls back to raw SQL when the Prisma update fails", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockQueryRawUnsafe.mockResolvedValue([{ id: "nf1" }]);
    mockNewsFeedUpdate.mockRejectedValue(new Error("Prisma delegate missing"));

    const res = await PUT(putRequest({ title: "New Title", description: "New desc" }), ctx);
    expect(res.status).toBe(200);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "NewsFeed"'),
      "New Title",
      "New desc",
      "nf1",
      "s1"
    );
  });

  it("skips the raw-SQL update entirely when there is nothing to change", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockQueryRawUnsafe.mockResolvedValue([{ id: "nf1" }]);
    mockNewsFeedUpdate.mockRejectedValue(new Error("Prisma delegate missing"));

    const res = await PUT(putRequest({}), ctx);
    expect(res.status).toBe(200);
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/newsfeed/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockQueryRawUnsafe.mockReset();
    mockExecuteRawUnsafe.mockReset().mockResolvedValue(undefined);
    mockNewsFeedDelete.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the feed does not belong to the caller's school", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockQueryRawUnsafe.mockResolvedValue([]);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes via Prisma", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockQueryRawUnsafe.mockResolvedValue([{ id: "nf1" }]);
    mockNewsFeedDelete.mockResolvedValue({ id: "nf1" });
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(200);
    expect(mockNewsFeedDelete).toHaveBeenCalledWith({ where: { id: "nf1" } });
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });

  it("falls back to raw SQL when the Prisma delete fails", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockQueryRawUnsafe.mockResolvedValue([{ id: "nf1" }]);
    mockNewsFeedDelete.mockRejectedValue(new Error("Prisma delegate missing"));
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(200);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM "NewsFeed"'),
      "nf1",
      "s1"
    );
  });
});
