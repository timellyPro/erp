/**
 * @jest-environment node
 */
import { GET } from "@/app/api/leaves/my/route";

const mockGetServerSession = jest.fn();
const mockLeaveRequestFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    leaveRequest: { findMany: (...args: unknown[]) => mockLeaveRequestFindMany(...args) },
  },
}));

describe("GET /api/leaves/my", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockLeaveRequestFindMany.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the caller's own leave requests ordered by createdAt desc", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockLeaveRequestFindMany.mockResolvedValue([{ id: "lv1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([{ id: "lv1" }]);
    expect(mockLeaveRequestFindMany).toHaveBeenCalledWith({
      where: { teacherId: "t1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1" } });
    mockLeaveRequestFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
