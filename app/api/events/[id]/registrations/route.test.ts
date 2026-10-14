/**
 * @jest-environment node
 */
import { GET } from "@/app/api/events/[id]/registrations/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockEventFindFirst = jest.fn();
const mockRegistrationFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
  },
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      event: { findFirst: (...args: unknown[]) => mockEventFindFirst(...args) },
      eventRegistration: { findMany: (...args: unknown[]) => mockRegistrationFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

function makeRequest() {
  return new Request("http://localhost/api/events/ev1/registrations");
}
const params = Promise.resolve({ id: "ev1" });

describe("GET /api/events/[id]/registrations", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockEventFindFirst.mockReset();
    mockRegistrationFindMany.mockReset();
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

  it("returns 404 when the event doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns the registered students, formatted", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockResolvedValue({ id: "ev1", title: "Robotics" });
    mockRegistrationFindMany.mockResolvedValue([
      {
        id: "reg1",
        paymentStatus: "PAID",
        student: {
          id: "st1",
          user: { id: "u1", name: "Alice", email: "a@x.com" },
          class: { id: "c1", name: "Grade 5", section: "A" },
        },
      },
    ]);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.students).toEqual([
      {
        id: "st1",
        registrationId: "reg1",
        name: "Alice",
        email: "a@x.com",
        class: "Grade 5-A",
        paymentStatus: "PAID",
      },
    ]);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockEventFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(500);
  });
});
