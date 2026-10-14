/**
 * @jest-environment node
 */
import { POST } from "@/app/api/newsfeed/create/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockNewsFeedCreate = jest.fn();
const mockExecuteRawUnsafe = jest.fn();
const mockGetSchoolUserIds = jest.fn();
const mockCreateNotificationsForUserIds = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/notificationService", () => ({
  getSchoolUserIds: (...args: unknown[]) => mockGetSchoolUserIds(...args),
  createNotificationsForUserIds: (...args: unknown[]) => mockCreateNotificationsForUserIds(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    newsFeed: { create: (...args: unknown[]) => mockNewsFeedCreate(...args) },
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
  },
}));

const postRequest = (body: unknown) =>
  new Request("http://localhost/api/newsfeed/create", {
    method: "POST",
    body: JSON.stringify(body),
  });

const session = { user: { id: "u1", name: "Admin One", email: "admin@example.com", schoolId: "s1" } };

const validBody = { title: "School Trip", description: "Announcing the annual school trip" };

describe("POST /api/newsfeed/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockNewsFeedCreate.mockReset();
    mockExecuteRawUnsafe.mockReset().mockResolvedValue(undefined);
    mockGetSchoolUserIds.mockReset().mockResolvedValue(["u1", "u2"]);
    mockCreateNotificationsForUserIds.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when title or description is missing", async () => {
    mockGetServerSession.mockResolvedValue(session);
    const res = await POST(postRequest({ title: "" , description: "x"}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no schoolId can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("creates the post via Prisma, notifies other school users, and returns 201", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockNewsFeedCreate.mockResolvedValue({
      id: "nf1",
      title: "School Trip",
      description: "Announcing the annual school trip",
      photo: null,
      photos: [],
      likes: 0,
      createdBy: { id: "u1", name: "Admin One", email: "admin@example.com" },
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    });

    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.newsFeed.id).toBe("nf1");
    expect(json.newsFeed.likedByMe).toBe(false);

    expect(mockGetSchoolUserIds).toHaveBeenCalledWith("s1");
    expect(mockCreateNotificationsForUserIds).toHaveBeenCalledWith(
      ["u2"],
      "NEWS",
      "New post",
      "School Trip"
    );
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });

  it("falls back to raw SQL insertion when the Prisma create fails", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockNewsFeedCreate.mockRejectedValue(new Error("Prisma delegate missing"));

    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.newsFeed.title).toBe("School Trip");
    expect(json.newsFeed.likes).toBe(0);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("truncates a long title for the notification body", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockNewsFeedCreate.mockResolvedValue({
      id: "nf1",
      title: "x".repeat(80),
      description: "desc",
      photo: null,
      photos: [],
      likes: 0,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await POST(postRequest({ title: "x".repeat(80), description: "desc" }));
    expect(mockCreateNotificationsForUserIds).toHaveBeenCalledWith(
      ["u2"],
      "NEWS",
      "New post",
      "x".repeat(60) + "…"
    );
  });
});
