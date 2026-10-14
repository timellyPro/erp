/**
 * @jest-environment node
 */
import { PUT, DELETE } from "@/app/api/events/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockEventFindFirst = jest.fn();
const mockEventUpdate = jest.fn();
const mockEventDelete = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    event: {
      findFirst: (...args: unknown[]) => mockEventFindFirst(...args),
      update: (...args: unknown[]) => mockEventUpdate(...args),
      delete: (...args: unknown[]) => mockEventDelete(...args),
    },
  },
}));

function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/events/ev1", { method: "PUT", body: JSON.stringify(body) });
}
function makeDeleteRequest() {
  return new Request("http://localhost/api/events/ev1", { method: "DELETE" });
}
const params = Promise.resolve({ id: "ev1" });

const validBody = {
  title: "Robotics",
  description: "Fun",
  type: "WORKSHOP",
  level: "SCHOOL",
  location: "Hall",
  mode: "OFFLINE",
  additionalInfo: "Bring laptop",
};

describe("PUT /api/events/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockEventFindFirst.mockReset();
    mockEventUpdate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(makePutRequest(validBody), { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest(validBody), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await PUT(makePutRequest({ title: "Robotics" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the event isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue(null);
    const res = await PUT(makePutRequest(validBody), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid eventDate", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue({ id: "ev1" });
    const res = await PUT(makePutRequest({ ...validBody, eventDate: "nope" }), { params });
    expect(res.status).toBe(400);
  });

  it("updates the event", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue({ id: "ev1" });
    mockEventUpdate.mockResolvedValue({ id: "ev1", title: "Robotics" });
    const res = await PUT(makePutRequest(validBody), { params });
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await PUT(makePutRequest(validBody), { params });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/events/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockEventFindFirst.mockReset();
    mockEventDelete.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the event isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("deletes the event", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue({ id: "ev1" });
    mockEventDelete.mockResolvedValue({ id: "ev1" });
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await DELETE(makeDeleteRequest(), { params });
    expect(res.status).toBe(500);
  });
});
