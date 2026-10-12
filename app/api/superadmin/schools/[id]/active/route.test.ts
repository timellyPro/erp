/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/superadmin/schools/[id]/active/route";

const mockGetServerSession = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/superadmin/schools/s1/active", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "s1" });

describe("PATCH /api/superadmin/schools/[id]/active", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindUnique.mockReset().mockResolvedValue({ id: "s1", name: "School One" });
    mockUpdate.mockReset().mockResolvedValue({ id: "s1", name: "School One", isActive: false });
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ isActive: false }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-superadmin role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "SCHOOLADMIN" } });
    const res = await PATCH(makeRequest({ isActive: false }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when isActive is missing or not a boolean", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "SUPERADMIN" } });
    const res = await PATCH(makeRequest({}), { params });
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when the school does not exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "SUPERADMIN" } });
    mockFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ isActive: false }), { params });
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("persists isActive via prisma.school.update (regression: this previously returned success without writing to the DB)", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "SUPERADMIN" } });
    const res = await PATCH(makeRequest({ isActive: false }), { params });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { isActive: false },
      select: { id: true, name: true, isActive: true },
    });
    const json = await res.json();
    expect(json.school).toEqual({ id: "s1", name: "School One", isActive: false });
  });

  it("can reactivate a school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "SUPERADMIN" } });
    mockUpdate.mockResolvedValue({ id: "s1", name: "School One", isActive: true });
    const res = await PATCH(makeRequest({ isActive: true }), { params });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { isActive: true },
      select: { id: true, name: true, isActive: true },
    });
  });
});
