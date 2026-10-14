/**
 * @jest-environment node
 */
import { GET } from "@/app/api/parent/subscription/status/route";

const mockGetServerSession = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockParentSubscriptionFindFirst = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    parentSubscription: { findFirst: (...args: unknown[]) => mockParentSubscriptionFindFirst(...args) },
  },
}));

describe("GET /api/parent/subscription/status", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindUnique.mockReset();
    mockParentSubscriptionFindFirst.mockReset();
  });

  it("returns 401 when the session isn't a student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 404 when the student or school isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1" } });
    mockStudentFindUnique.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("returns EXPIRED/deactivated when the school is inactive", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1" } });
    mockStudentFindUnique.mockResolvedValue({ school: { isActive: false } });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("EXPIRED");
    expect(json.deactivated).toBe(true);
  });

  it("returns ACTIVE for SCHOOL_PAID billing mode without querying subscriptions", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1" } });
    mockStudentFindUnique.mockResolvedValue({
      school: { isActive: true, billingMode: "SCHOOL_PAID", parentSubscriptionAmount: 0, parentSubscriptionTrialDays: 0 },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ACTIVE");
    expect(mockParentSubscriptionFindFirst).not.toHaveBeenCalled();
  });

  it("reports ACTIVE with remaining days for an active parent subscription", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1" } });
    mockStudentFindUnique.mockResolvedValue({
      school: { id: "s1", isActive: true, billingMode: "PARENT_SUBSCRIPTION", parentSubscriptionAmount: 200, parentSubscriptionTrialDays: 7 },
    });
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    mockParentSubscriptionFindFirst.mockResolvedValue({
      status: "ACTIVE",
      isTrial: false,
      currentPeriodEnd: future,
      amount: 200,
      invoiceUrl: null,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ACTIVE");
    expect(json.remainingDays).toBeGreaterThan(0);
  });

  it("reports EXPIRED when there's no active subscription or trial", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1" } });
    mockStudentFindUnique.mockResolvedValue({
      school: { id: "s1", isActive: true, billingMode: "PARENT_SUBSCRIPTION", parentSubscriptionAmount: 200, parentSubscriptionTrialDays: 7 },
    });
    mockParentSubscriptionFindFirst.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("EXPIRED");
    expect(json.remainingDays).toBe(0);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1" } });
    mockStudentFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
