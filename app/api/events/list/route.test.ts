/**
 * @jest-environment node
 */
import { GET } from "@/app/api/events/list/route";

const mockGetServerSession = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockEventFindMany = jest.fn();
const mockRegistrationFindMany = jest.fn();
const mockCertificateFindMany = jest.fn();
const mockSwrRead = jest.fn();
const mockSwrWrite = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
  },
}));

// Event/registration/certificate reads now go through the app_tenant-connected,
// RLS-restricted client (docs/SECURITY_REVIEW.md) instead of the app's normal
// prisma import.
const mockWithTenantScopedClient = jest.fn(async (_schoolId: string, fn: (tx: unknown) => unknown) =>
  fn({
    event: { findMany: (...args: unknown[]) => mockEventFindMany(...args) },
    eventRegistration: { findMany: (...args: unknown[]) => mockRegistrationFindMany(...args) },
    certificate: { findMany: (...args: unknown[]) => mockCertificateFindMany(...args) },
  })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

jest.mock("@/lib/parent/parentPortalSwr", () => ({
  parentPortalSwrRead: (...args: unknown[]) => mockSwrRead(...args),
  parentPortalSwrWrite: (...args: unknown[]) => mockSwrWrite(...args),
  PARENT_LIST_TTL: 60,
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/events/list${query}`);
}

describe("GET /api/events/list", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindUnique.mockReset();
    mockSchoolFindFirst.mockReset();
    mockEventFindMany.mockReset();
    mockRegistrationFindMany.mockReset();
    mockCertificateFindMany.mockReset();
    mockSwrRead.mockReset();
    mockSwrWrite.mockReset();
    mockSwrRead.mockResolvedValue({ value: null });
    mockSwrWrite.mockResolvedValue(undefined);
    mockWithTenantScopedClient.mockClear();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns plain events for staff", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockEventFindMany.mockResolvedValue([{ id: "ev1" }]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toEqual([{ id: "ev1" }]);
  });

  it("returns a cached payload for a student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    mockSwrRead.mockResolvedValue({ value: { events: [{ id: "cached" }] } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toEqual([{ id: "cached" }]);
    expect(mockEventFindMany).not.toHaveBeenCalled();
  });

  it("enriches events with registration/certificate info for a student and caches it", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    mockEventFindMany.mockResolvedValue([{ id: "ev1", title: "Robotics" }]);
    mockRegistrationFindMany.mockResolvedValue([{ eventId: "ev1", paymentStatus: "PAID" }]);
    mockCertificateFindMany.mockResolvedValue([{ title: "Robotics - Participation" }]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events[0].isRegistered).toBe(true);
    expect(json.events[0].hasCertificate).toBe(true);
    expect(mockSwrWrite).toHaveBeenCalled();
  });

  it("filters by scope=teacher for a teacher session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1", role: "TEACHER" } });
    mockEventFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("?scope=teacher"));
    expect(res.status).toBe(200);
    expect(mockEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ teacherId: "t1" }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", schoolId: "s1" } });
    mockEventFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
