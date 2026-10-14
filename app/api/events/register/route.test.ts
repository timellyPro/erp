/**
 * @jest-environment node
 */
import { POST } from "@/app/api/events/register/route";

// Rate limiting has its own dedicated tests (lib/rateLimit.test.ts). Mocked here
// so this suite doesn't exercise real Upstash Redis (this repo's .env carries a
// live Upstash instance) and isn't affected by call-count state across test runs.
jest.mock("@/lib/rateLimit", () => ({
  rateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 19, resetInSeconds: 600 }),
  rateLimitKey: (...parts: string[]) => parts.join(":"),
}));

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockEventFindFirst = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockRegistrationFindUnique = jest.fn();
const mockRegistrationCreate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    event: { findFirst: (...args: unknown[]) => mockEventFindFirst(...args) },
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    eventRegistration: {
      findUnique: (...args: unknown[]) => mockRegistrationFindUnique(...args),
      create: (...args: unknown[]) => mockRegistrationCreate(...args),
    },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/events/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/events/register", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockEventFindFirst.mockReset();
    mockStudentFindUnique.mockReset();
    mockRegistrationFindUnique.mockReset();
    mockRegistrationCreate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when eventId is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the session has no studentId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest({ eventId: "ev1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the event doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({ eventId: "ev1" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when the workshop is full", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue({
      id: "ev1", maxSeats: 2, classId: null, amount: 0, _count: { registrations: 2 },
    });
    const res = await POST(makeRequest({ eventId: "ev1" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when the event is restricted to a different class", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue({
      id: "ev1", maxSeats: null, classId: "c1", amount: 0, _count: { registrations: 0 },
    });
    mockStudentFindUnique.mockResolvedValue({ classId: "c2" });
    const res = await POST(makeRequest({ eventId: "ev1" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when already registered", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue({
      id: "ev1", maxSeats: null, classId: null, amount: 0, _count: { registrations: 0 },
    });
    mockRegistrationFindUnique.mockResolvedValue({ id: "reg1" });
    const res = await POST(makeRequest({ eventId: "ev1" }));
    expect(res.status).toBe(400);
  });

  it("registers the student and flags payment required for a paid event", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue({
      id: "ev1", maxSeats: null, classId: null, amount: 100, _count: { registrations: 0 },
    });
    mockRegistrationFindUnique.mockResolvedValue(null);
    mockRegistrationCreate.mockResolvedValue({ id: "reg1" });
    const res = await POST(makeRequest({ eventId: "ev1" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.paymentRequired).toBe(true);
    expect(json.amount).toBe(100);
  });

  it("maps a Prisma P2002 error to an already-registered message", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue({
      id: "ev1", maxSeats: null, classId: null, amount: 0, _count: { registrations: 0 },
    });
    mockRegistrationFindUnique.mockResolvedValue(null);
    mockRegistrationCreate.mockRejectedValue({ code: "P2002" });
    const res = await POST(makeRequest({ eventId: "ev1" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/already registered/i);
  });

  it("returns 500 when the database throws a generic error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockEventFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ eventId: "ev1" }));
    expect(res.status).toBe(500);
  });
});
