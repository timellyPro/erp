/**
 * @jest-environment node
 */
import { POST } from "@/app/api/superadmin/chairmen/create/route";

const mockGetServerSession = jest.fn();
const mockBcryptHash = jest.fn();
const mockSchoolFindUnique = jest.fn();
const mockUserFindFirst = jest.fn();
const mockQueryRaw = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("bcryptjs", () => ({
  hash: (...args: unknown[]) => mockBcryptHash(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args) },
    user: { findFirst: (...args: unknown[]) => mockUserFindFirst(...args) },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/superadmin/chairmen/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = { schoolId: "s1", name: "Chairman A", email: "a@x.com", password: "pass1234" };

describe("POST /api/superadmin/chairmen/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockBcryptHash.mockReset();
    mockSchoolFindUnique.mockReset();
    mockUserFindFirst.mockReset();
    mockQueryRaw.mockReset();
    mockBcryptHash.mockResolvedValue("hashed");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-superadmin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    const res = await POST(makeRequest({ schoolId: "s1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid email", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    const res = await POST(makeRequest({ ...validBody, email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the school doesn't exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 400 when a user already exists with that email", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindUnique.mockResolvedValue({ id: "s1", name: "Greenwood" });
    mockUserFindFirst.mockResolvedValue({ id: "existing" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("creates the chairman", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindUnique.mockResolvedValue({ id: "s1", name: "Greenwood" });
    mockUserFindFirst.mockResolvedValue(null);
    mockQueryRaw.mockResolvedValue([{ id: "c1", name: "Chairman A", email: "a@x.com", role: "CHAIRMAN", schoolId: "s1" }]);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
  });

  it("maps a Prisma P2002 error to an already-exists message", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindUnique.mockResolvedValue({ id: "s1", name: "Greenwood" });
    mockUserFindFirst.mockResolvedValue(null);
    mockQueryRaw.mockRejectedValue({ code: "P2002" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 503 for a Prisma connection error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindUnique.mockRejectedValue({ code: "P1001" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
  });
});
