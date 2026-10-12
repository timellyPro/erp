/**
 * @jest-environment node
 */
import { GET } from "@/app/api/events/create/[id]/route";

const mockGetServerSession = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockEventFindFirst = jest.fn();
const mockRegistrationFindUnique = jest.fn();
const mockCertificateFindFirst = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    event: { findFirst: (...args: unknown[]) => mockEventFindFirst(...args) },
    eventRegistration: { findUnique: (...args: unknown[]) => mockRegistrationFindUnique(...args) },
    certificate: { findFirst: (...args: unknown[]) => mockCertificateFindFirst(...args) },
  },
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      event: { findFirst: (...args: unknown[]) => mockEventFindFirst(...args) },
      eventRegistration: { findUnique: (...args: unknown[]) => mockRegistrationFindUnique(...args) },
      certificate: { findFirst: (...args: unknown[]) => mockCertificateFindFirst(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest() {
  return new Request("http://localhost/api/events/create/ev1");
}
const params = Promise.resolve({ id: "ev1" });

describe("GET /api/events/create/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindUnique.mockReset();
    mockSchoolFindFirst.mockReset();
    mockEventFindFirst.mockReset();
    mockRegistrationFindUnique.mockReset();
    mockCertificateFindFirst.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the event isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns event details with no registration info for staff", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue({ id: "ev1", title: "Robotics" });
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.event.isRegistered).toBe(false);
  });

  it("includes registration and certificate info for a student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    mockEventFindFirst.mockResolvedValue({ id: "ev1", title: "Robotics" });
    mockRegistrationFindUnique.mockResolvedValue({ id: "reg1", paymentStatus: "PAID" });
    mockCertificateFindFirst.mockResolvedValue({
      id: "cert1",
      title: "Robotics - Participation",
      certificateUrl: "https://x/cert.pdf",
      issuedDate: new Date("2026-01-01"),
    });
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.event.isRegistered).toBe(true);
    expect(json.event.registration).toEqual({ id: "reg1", paymentStatus: "PAID" });
    expect(json.event.workshopCertificate.id).toBe("cert1");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(500);
  });
});
