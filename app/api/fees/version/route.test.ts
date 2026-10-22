/**
 * @jest-environment node
 */
import { GET } from "@/app/api/fees/version/route";

const mockGetServerSession = jest.fn();
const mockResolveSchoolId = jest.fn();
const mockGetVersion = jest.fn();

jest.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock("@/lib/auth/authOptions", () => ({}));
jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
}));
jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...a: unknown[]) => mockResolveSchoolId(...a),
}));
jest.mock("@/lib/fees/feeDataVersion", () => ({
  getSchoolFeeDataVersion: (...a: unknown[]) => mockGetVersion(...a),
}));

describe("GET /api/fees/version", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveSchoolId.mockReset().mockResolvedValue("s1");
    mockGetVersion.mockReset().mockResolvedValue(12);
  });

  it("401 when not signed in", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockResolveSchoolId.mockResolvedValue(null);
    expect((await GET()).status).toBe(400);
  });

  it("returns only the school's counter", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 12 });
    expect(mockGetVersion).toHaveBeenCalledWith("s1");
  });

  it("returns a null version (unknown) rather than failing when the counter cannot be read", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockGetVersion.mockResolvedValue(null);
    expect(await (await GET()).json()).toEqual({ version: null });
  });
});
