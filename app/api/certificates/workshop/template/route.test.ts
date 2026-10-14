/**
 * @jest-environment node
 */
import { POST } from "@/app/api/certificates/workshop/template/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockCreate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    certificateTemplate: { create: (...args: unknown[]) => mockCreate(...args) },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/certificates/workshop/template", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/certificates/workshop/template", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockCreate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when eventTitle or imageUrl is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest({ eventTitle: "Robotics" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({ eventTitle: "Robotics", imageUrl: "https://x/img.png" }));
    expect(res.status).toBe(400);
  });

  it("creates the workshop template and returns 201", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockCreate.mockResolvedValue({ id: "tpl1" });
    const res = await POST(makeRequest({ eventTitle: "Robotics", imageUrl: "https://x/img.png" }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Workshop: Robotics",
          schoolId: "s1",
          imageUrl: "https://x/img.png",
        }),
      })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockCreate.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ eventTitle: "Robotics", imageUrl: "https://x/img.png" }));
    expect(res.status).toBe(500);
  });
});
