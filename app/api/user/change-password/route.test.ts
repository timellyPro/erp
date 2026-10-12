/**
 * @jest-environment node
 */
import { POST } from "@/app/api/user/change-password/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserUpdate = jest.fn();
const mockBcryptCompare = jest.fn();
const mockBcryptHash = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("bcryptjs", () => ({
  compare: (...args: unknown[]) => mockBcryptCompare(...args),
  hash: (...args: unknown[]) => mockBcryptHash(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

const request = (body: unknown) =>
  new Request("http://localhost/api/user/change-password", {
    method: "POST",
    body: JSON.stringify(body),
  });

const session = { user: { id: "u1" } };

describe("POST /api/user/change-password", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserFindUnique.mockReset();
    mockUserUpdate.mockReset();
    mockBcryptCompare.mockReset();
    mockBcryptHash.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request({ currentPassword: "old", newPassword: "new" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when currentPassword or newPassword is missing", async () => {
    mockGetServerSession.mockResolvedValue(session);
    const res = await POST(request({ currentPassword: "old" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the user has no password on file (e.g. OAuth-only account)", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserFindUnique.mockResolvedValue({ id: "u1", password: null });
    const res = await POST(request({ currentPassword: "old", newPassword: "new" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when the current password does not match", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserFindUnique.mockResolvedValue({ id: "u1", password: "hashed-old" });
    mockBcryptCompare.mockResolvedValue(false);
    const res = await POST(request({ currentPassword: "wrong", newPassword: "new" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/current password is incorrect/i);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("hashes and stores the new password when the current password matches", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserFindUnique.mockResolvedValue({ id: "u1", password: "hashed-old" });
    mockBcryptCompare.mockResolvedValue(true);
    mockBcryptHash.mockResolvedValue("hashed-new");
    mockUserUpdate.mockResolvedValue({});

    const res = await POST(request({ currentPassword: "old", newPassword: "new-pass" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("Password updated");

    expect(mockBcryptCompare).toHaveBeenCalledWith("old", "hashed-old");
    expect(mockBcryptHash).toHaveBeenCalledWith("new-pass", 10);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { password: "hashed-new" },
    });
  });

  it("returns 500 when the database lookup throws", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockUserFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(request({ currentPassword: "old", newPassword: "new" }));
    expect(res.status).toBe(500);
  });
});
