/**
 * @jest-environment node
 */
import { POST } from "@/app/api/events/create/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockClassFindFirst = jest.fn();
const mockEventCreate = jest.fn();
const mockRegistrationCreateMany = jest.fn();
const mockGetSchoolUserIds = jest.fn();
const mockCreateNotificationsForUserIds = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    event: { create: (...args: unknown[]) => mockEventCreate(...args) },
    eventRegistration: { createMany: (...args: unknown[]) => mockRegistrationCreateMany(...args) },
  },
}));

jest.mock("@/lib/notificationService", () => ({
  getSchoolUserIds: (...args: unknown[]) => mockGetSchoolUserIds(...args),
  createNotificationsForUserIds: (...args: unknown[]) => mockCreateNotificationsForUserIds(...args),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/events/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  title: "Robotics",
  description: "Fun",
  type: "WORKSHOP",
  level: "SCHOOL",
  location: "Hall",
  mode: "OFFLINE",
  additionalInfo: "Bring laptop",
};

describe("POST /api/events/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockClassFindFirst.mockReset();
    mockEventCreate.mockReset();
    mockRegistrationCreateMany.mockReset();
    mockGetSchoolUserIds.mockReset();
    mockCreateNotificationsForUserIds.mockReset();
    mockGetSchoolUserIds.mockResolvedValue([]);
    mockCreateNotificationsForUserIds.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    const res = await POST(makeRequest({ title: "Robotics" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no schoolId in session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the given classId doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockClassFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({ ...validBody, classId: "c1" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid eventDate", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    const res = await POST(makeRequest({ ...validBody, eventDate: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("creates the event, pre-registers students, and notifies the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockEventCreate.mockResolvedValue({ id: "ev1" });
    mockGetSchoolUserIds.mockResolvedValue(["u1", "u2", "t1"]);
    const res = await POST(makeRequest({ ...validBody, studentIds: ["st1", "st2"] }));
    expect(res.status).toBe(201);
    expect(mockRegistrationCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { eventId: "ev1", studentId: "st1", paymentStatus: "PENDING" },
          { eventId: "ev1", studentId: "st2", paymentStatus: "PENDING" },
        ],
        skipDuplicates: true,
      })
    );
    expect(mockCreateNotificationsForUserIds).toHaveBeenCalledWith(
      ["u1", "u2"],
      "WORKSHOPS",
      expect.any(String),
      expect.any(String)
    );
  });

  it("still succeeds when the notification step fails", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockEventCreate.mockResolvedValue({ id: "ev1" });
    mockGetSchoolUserIds.mockRejectedValue(new Error("notify failed"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockEventCreate.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
