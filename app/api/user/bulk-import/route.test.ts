/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/user/bulk-import/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
const mockBcryptHash = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("bcryptjs", () => ({
  hash: (...args: unknown[]) => mockBcryptHash(...args),
}));

jest.mock("../../../../lib/db", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      create: (...args: unknown[]) => mockUserCreate(...args),
    },
  },
}));

function requestWithCsv(csv: string | null): NextRequest {
  const formData = new FormData();
  if (csv !== null) {
    formData.set("file", new File([csv], "users.csv", { type: "text/csv" }));
  }
  return new NextRequest("http://localhost/api/user/bulk-import", {
    method: "POST",
    body: formData,
  });
}

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const validCsv = "name,email,role,designation,password\nJohn Doe,john@school.com,TEACHER,Senior Teacher,Password123";

describe("POST /api/user/bulk-import", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockUserFindUnique.mockReset().mockResolvedValue(null);
    mockUserCreate.mockReset().mockResolvedValue({ id: "new-user" });
    mockBcryptHash.mockReset().mockResolvedValue("hashed-pw");
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(requestWithCsv(validCsv));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot import users", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await POST(requestWithCsv(validCsv));
    expect(res.status).toBe(403);
  });

  it("returns 400 when no file is provided", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(requestWithCsv(null));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the CSV has no data rows", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(requestWithCsv("name,email,role,designation,password"));
    expect(res.status).toBe(400);
  });

  it("creates the user and reports success for a valid row", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const res = await POST(requestWithCsv(validCsv));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ successful: 1, failed: 0, total: 1, errors: [] });
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "John Doe",
          email: "john@school.com",
          role: "TEACHER",
          password: "hashed-pw",
          subject: "Senior Teacher",
        }),
      })
    );
  });

  it("reports a row error for missing required fields", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const csv = "name,email,role,designation,password\n,missing@x.com,TEACHER,,pw";
    const res = await POST(requestWithCsv(csv));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failed).toBe(1);
    expect(json.errors[0]).toMatch(/missing required fields/i);
  });

  it("reports a row error for an invalid role", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const csv = "name,email,role,designation,password\nJohn,john@x.com,BOGUS,,pw";
    const res = await POST(requestWithCsv(csv));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failed).toBe(1);
    expect(json.errors[0]).toMatch(/invalid role/i);
  });

  it("reports a row error for an invalid email format", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const csv = "name,email,role,designation,password\nJohn,not-an-email,TEACHER,,pw";
    const res = await POST(requestWithCsv(csv));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failed).toBe(1);
    expect(json.errors[0]).toMatch(/invalid email format/i);
  });

  it("reports a row error when the email already exists in the school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockUserFindUnique.mockResolvedValue({ id: "existing" });
    const res = await POST(requestWithCsv(validCsv));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failed).toBe(1);
    expect(json.errors[0]).toMatch(/email already exists/i);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("processes multiple rows independently, mixing successes and failures", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const csv = [
      "name,email,role,designation,password",
      "John Doe,john@school.com,TEACHER,Senior Teacher,Password123",
      "Bad Row,not-an-email,TEACHER,,pw",
      "Admin User,admin@school.com,SCHOOLADMIN,Principal,Password123",
    ].join("\n");
    const res = await POST(requestWithCsv(csv));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(3);
    expect(json.successful).toBe(2);
    expect(json.failed).toBe(1);
    expect(mockUserCreate).toHaveBeenCalledTimes(2);
  });

  it("returns 500 when the CSV cannot be read from the request", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    const req = new NextRequest("http://localhost/api/user/bulk-import", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
