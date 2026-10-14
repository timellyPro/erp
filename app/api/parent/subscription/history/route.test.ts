/**
 * @jest-environment node
 */
import { GET } from "@/app/api/parent/subscription/history/route";

const mockGetServerSession = jest.fn();
const mockPaymentFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    payment: { findMany: (...args: unknown[]) => mockPaymentFindMany(...args) },
  },
}));

describe("GET /api/parent/subscription/history", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockPaymentFindMany.mockReset();
  });

  it("returns 401 when the session isn't a student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns successful subscription payments", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1" } });
    mockPaymentFindMany.mockResolvedValue([
      { id: "p1", amount: 200, createdAt: new Date("2026-01-01"), transactionId: "tx1" },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: "st1", purpose: "PARENT_SUBSCRIPTION", status: "SUCCESS" },
      })
    );
    const json = await res.json();
    expect(json.payments).toHaveLength(1);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", studentId: "st1" } });
    mockPaymentFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
