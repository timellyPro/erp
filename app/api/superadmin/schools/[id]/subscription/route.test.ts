/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/superadmin/schools/[id]/subscription/route";

const mockGetServerSession = jest.fn();
const mockSchoolUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { update: (...args: unknown[]) => mockSchoolUpdate(...args) },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/superadmin/schools/s1/subscription", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/superadmin/schools/[id]/subscription", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolUpdate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-superadmin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(403);
  });

  it("updates billing mode, amount, trial days, and active flag", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolUpdate.mockResolvedValue({ id: "s1", name: "Greenwood", isActive: false });
    const res = await PATCH(
      makeRequest({
        billingMode: "SCHOOL_PAID",
        parentSubscriptionAmount: null,
        parentSubscriptionTrialDays: 14,
        isActive: false,
      })
    );
    expect(res.status).toBe(200);
    expect(mockSchoolUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: {
          billingMode: "SCHOOL_PAID",
          parentSubscriptionAmount: null,
          parentSubscriptionTrialDays: 14,
          isActive: false,
        },
      })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolUpdate.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH(makeRequest({ name: "New Name" }));
    expect(res.status).toBe(500);
  });
});
