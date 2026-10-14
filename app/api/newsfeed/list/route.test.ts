/**
 * @jest-environment node
 */
import { GET } from "@/app/api/newsfeed/list/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockNewsFeedFindMany = jest.fn();
const mockNewsFeedLikeFindMany = jest.fn();
const mockQueryRawUnsafe = jest.fn();
const mockPurgeExpiredNewsFeeds = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/newsfeedRetention", () => ({
  purgeExpiredNewsFeeds: (...args: unknown[]) => mockPurgeExpiredNewsFeeds(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
  },
}));

// News feed reads (both the normal and raw-SQL-fallback paths) now go through
// the app_tenant-connected, RLS-restricted client (docs/SECURITY_REVIEW.md)
// instead of the app's normal prisma import.
const mockWithTenantScopedClient = jest.fn(async (_schoolId: string, fn: (tx: unknown) => unknown) =>
  fn({
    newsFeed: { findMany: (...args: unknown[]) => mockNewsFeedFindMany(...args) },
    newsFeedLike: { findMany: (...args: unknown[]) => mockNewsFeedLikeFindMany(...args) },
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
  })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

const session = { user: { id: "u1", schoolId: "s1" } };

const feedRow = {
  id: "nf1",
  title: "Post One",
  description: "Desc",
  photo: "https://x/1.jpg",
  photos: [],
  likes: 3,
  schoolId: "s1",
  createdById: "u1",
  createdBy: { id: "u1", name: "Admin", email: "a@x.com", photoUrl: null },
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

describe("GET /api/newsfeed/list", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockNewsFeedFindMany.mockReset();
    mockNewsFeedLikeFindMany.mockReset().mockResolvedValue([]);
    mockQueryRawUnsafe.mockReset();
    mockPurgeExpiredNewsFeeds.mockReset().mockResolvedValue(undefined);
    mockWithTenantScopedClient.mockClear();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns an empty list when no schoolId can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newsFeeds).toEqual([]);
    expect(mockNewsFeedFindMany).not.toHaveBeenCalled();
  });

  it("lists the school's feeds via Prisma, marking liked posts", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockNewsFeedFindMany.mockResolvedValue([feedRow]);
    mockNewsFeedLikeFindMany.mockResolvedValue([{ newsFeedId: "nf1" }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newsFeeds).toHaveLength(1);
    expect(json.newsFeeds[0]).toMatchObject({
      id: "nf1",
      title: "Post One",
      photo: "https://x/1.jpg",
      mediaType: "PHOTO",
      likedByMe: true,
      createdBy: { id: "u1", name: "Admin", email: "a@x.com", photoUrl: null },
    });
  });

  it("falls back to raw SQL when the Prisma list query fails", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockNewsFeedFindMany.mockRejectedValue(new Error("Prisma delegate missing"));
    mockQueryRawUnsafe.mockResolvedValueOnce([
      {
        id: "nf1",
        title: "Post One",
        description: "Desc",
        photo: "https://x/1.jpg",
        photos: null,
        likes: 3,
        schoolId: "s1",
        createdById: "u1",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
        creatorId: "u1",
        creatorName: "Admin",
        creatorEmail: "a@x.com",
      },
    ]);
    mockQueryRawUnsafe.mockResolvedValueOnce([{ newsFeedId: "nf1" }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newsFeeds).toHaveLength(1);
    expect(json.newsFeeds[0].likedByMe).toBe(true);
    expect(json.newsFeeds[0].createdBy).toEqual({ id: "u1", name: "Admin", email: "a@x.com" });
  });

  it("returns 500 when both the Prisma and raw-SQL paths fail", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockNewsFeedFindMany.mockRejectedValue(new Error("Prisma delegate missing"));
    mockQueryRawUnsafe.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
