/**
 * @jest-environment node
 */
import { POST } from "@/app/api/superadmin/schools/create/route";

const mockGetServerSession = jest.fn();
const mockBcryptHash = jest.fn();
const mockUserFindFirst = jest.fn();
const mockTransaction = jest.fn();

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
    user: { findFirst: (...args: unknown[]) => mockUserFindFirst(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/superadmin/schools/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = { schoolName: "Greenwood", email: "admin@gw.com", password: "pass1234" };

describe("POST /api/superadmin/schools/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockBcryptHash.mockReset();
    mockUserFindFirst.mockReset();
    mockTransaction.mockReset();
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
    const res = await POST(makeRequest({ schoolName: "Greenwood" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid email", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    const res = await POST(makeRequest({ ...validBody, email: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a user already exists with that email", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockUserFindFirst.mockResolvedValue({ id: "existing" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("creates the school and admin in a transaction", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockUserFindFirst.mockResolvedValue(null);
    mockTransaction.mockImplementation(async (fn) =>
      fn({
        user: {
          create: jest.fn().mockResolvedValue({ id: "u2", name: "Greenwood", email: "admin@gw.com" }),
          update: jest.fn().mockResolvedValue({}),
        },
        school: { create: jest.fn().mockResolvedValue({ id: "s1", name: "Greenwood" }) },
      })
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
  });

  it("maps a Prisma P2002 error to an email-exists message", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockUserFindFirst.mockResolvedValue(null);
    mockTransaction.mockRejectedValue({ code: "P2002" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 500 for a generic error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockUserFindFirst.mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
