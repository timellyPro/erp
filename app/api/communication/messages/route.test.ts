/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/communication/messages/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockAppointmentFindUnique = jest.fn();
const mockMessagesFindMany = jest.fn();
const mockMessagesCreate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    appointment: { findUnique: (...args: unknown[]) => mockAppointmentFindUnique(...args) },
    chatMessage: {
      findMany: (...args: unknown[]) => mockMessagesFindMany(...args),
      create: (...args: unknown[]) => mockMessagesCreate(...args),
    },
  },
}));

function makeGetRequest(query = "") {
  return new Request(`http://localhost/api/communication/messages${query}`);
}
function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/communication/messages", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/communication/messages", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockAppointmentFindUnique.mockReset();
    mockMessagesFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest("?appointmentId=a1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when appointmentId is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
  });

  it("returns 404 when the appointment doesn't exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockAppointmentFindUnique.mockResolvedValue(null);
    const res = await GET(makeGetRequest("?appointmentId=a1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller isn't part of the appointment", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    mockAppointmentFindUnique.mockResolvedValue({ studentId: "other", teacherId: "t9" });
    const res = await GET(makeGetRequest("?appointmentId=a1"));
    expect(res.status).toBe(403);
  });

  it("returns the messages for a participant", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", studentId: undefined } });
    mockAppointmentFindUnique.mockResolvedValue({ studentId: "st1", teacherId: "t1" });
    mockMessagesFindMany.mockResolvedValue([{ id: "m1" }]);
    const res = await GET(makeGetRequest("?appointmentId=a1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.messages).toEqual([{ id: "m1" }]);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockAppointmentFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest("?appointmentId=a1"));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/communication/messages", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockAppointmentFindUnique.mockReset();
    mockMessagesCreate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when appointmentId or content is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makePostRequest({ appointmentId: "a1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the appointment doesn't exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockAppointmentFindUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest({ appointmentId: "a1", content: "hi" }));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller isn't part of the appointment", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    mockAppointmentFindUnique.mockResolvedValue({ studentId: "other", teacherId: "t9", status: "APPROVED" });
    const res = await POST(makePostRequest({ appointmentId: "a1", content: "hi" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when the appointment isn't approved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockAppointmentFindUnique.mockResolvedValue({ studentId: "st1", teacherId: "t1", status: "PENDING" });
    const res = await POST(makePostRequest({ appointmentId: "a1", content: "hi" }));
    expect(res.status).toBe(400);
  });

  it("returns a specific message when the chat was ended", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockAppointmentFindUnique.mockResolvedValue({ studentId: "st1", teacherId: "t1", status: "ENDED" });
    const res = await POST(makePostRequest({ appointmentId: "a1", content: "hi" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/ended/i);
  });

  it("creates the message and returns 201", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockAppointmentFindUnique.mockResolvedValue({ studentId: "st1", teacherId: "t1", status: "APPROVED" });
    mockMessagesCreate.mockResolvedValue({ id: "m1", content: "hi" });
    const res = await POST(makePostRequest({ appointmentId: "a1", content: "hi" }));
    expect(res.status).toBe(201);
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ appointmentId: "a1", senderId: "t1", content: "hi" }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockAppointmentFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makePostRequest({ appointmentId: "a1", content: "hi" }));
    expect(res.status).toBe(500);
  });
});
