/**
 * @jest-environment node
 */
import { POST } from "@/app/api/newsfeed/[id]/like/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockNewsFeedFindUnique = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockInvalidateParentPortalCaches = jest.fn();
const mockTransaction = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/parent/invalidateParentPortalCaches", () => ({
  invalidateParentPortalCaches: (...args: unknown[]) => mockInvalidateParentPortalCaches(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    newsFeed: { findUnique: (...args: unknown[]) => mockNewsFeedFindUnique(...args) },
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const ctx = { params: Promise.resolve({ id: "nf1" }) };
const request = () => new Request("http://localhost/api/newsfeed/nf1/like", { method: "POST" });

function txMock(existingLike: { id: string } | null, updatedLikes: number) {
  return {
    newsFeedLike: {
      findUnique: jest.fn().mockResolvedValue(existingLike),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    newsFeed: {
      update: jest.fn().mockResolvedValue({ likes: updatedLikes }),
    },
  };
}

describe("POST /api/newsfeed/[id]/like", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockNewsFeedFindUnique.mockReset();
    mockStudentFindUnique.mockReset();
    mockInvalidateParentPortalCaches.mockReset();
    mockTransaction.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the feed does not exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNewsFeedFindUnique.mockResolvedValue(null);
    const res = await POST(request(), ctx);
    expect(res.status).toBe(404);
  });

  it("likes the feed and increments the like count when not already liked", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNewsFeedFindUnique.mockResolvedValue({ id: "nf1" });
    const tx = txMock(null, 4);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const res = await POST(request(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ liked: true, likes: 4 });
    expect(tx.newsFeedLike.create).toHaveBeenCalledWith({ data: { userId: "u1", newsFeedId: "nf1" } });
    expect(tx.newsFeed.update).toHaveBeenCalledWith({
      where: { id: "nf1" },
      data: { likes: { increment: 1 } },
      select: { likes: true },
    });
  });

  it("unlikes the feed and decrements the like count when already liked", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNewsFeedFindUnique.mockResolvedValue({ id: "nf1" });
    const tx = txMock({ id: "like1" }, 2);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const res = await POST(request(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ liked: false, likes: 2 });
    expect(tx.newsFeedLike.delete).toHaveBeenCalledWith({
      where: { userId_newsFeedId: { userId: "u1", newsFeedId: "nf1" } },
    });
  });

  it("never returns a negative like count", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNewsFeedFindUnique.mockResolvedValue({ id: "nf1" });
    const tx = txMock({ id: "like1" }, -1);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const res = await POST(request(), ctx);
    const json = await res.json();
    expect(json.likes).toBe(0);
  });

  it("invalidates parent-portal caches for a student session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "stu1" } });
    mockNewsFeedFindUnique.mockResolvedValue({ id: "nf1" });
    mockStudentFindUnique.mockResolvedValue({ schoolId: "s1" });
    const tx = txMock(null, 1);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    await POST(request(), ctx);
    expect(mockInvalidateParentPortalCaches).toHaveBeenCalledWith({ schoolId: "s1", studentId: "stu1" });
  });

  it("skips cache invalidation when the session has no studentId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNewsFeedFindUnique.mockResolvedValue({ id: "nf1" });
    const tx = txMock(null, 1);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    await POST(request(), ctx);
    expect(mockStudentFindUnique).not.toHaveBeenCalled();
    expect(mockInvalidateParentPortalCaches).not.toHaveBeenCalled();
  });

  it("returns 500 when the transaction throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockNewsFeedFindUnique.mockResolvedValue({ id: "nf1" });
    mockTransaction.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(request(), ctx);
    expect(res.status).toBe(500);
  });
});
