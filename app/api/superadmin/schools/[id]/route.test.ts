/**
 * @jest-environment node
 */
import { DELETE } from "@/app/api/superadmin/schools/[id]/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindUnique = jest.fn();
const mockUserFindMany = jest.fn();
const mockTransaction = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: {
      findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args), deleteMany: jest.fn() },
    class: { updateMany: jest.fn(), deleteMany: jest.fn() },
    student: { deleteMany: jest.fn() },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/superadmin/schools/s1", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "s1" });

describe("DELETE /api/superadmin/schools/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindUnique.mockReset();
    mockUserFindMany.mockReset();
    mockTransaction.mockReset();
    mockTransaction.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(makeRequest({}), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-superadmin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await DELETE(makeRequest({}), { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the school isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ schoolName: "Greenwood" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when the confirmation name doesn't match", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindUnique.mockResolvedValue({ id: "s1", name: "Greenwood", admins: [], teachers: [], students: [] });
    const res = await DELETE(makeRequest({ schoolName: "Wrong Name" }), { params });
    expect(res.status).toBe(400);
  });

  it("deletes the school when confirmation matches", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindUnique.mockResolvedValue({
      id: "s1",
      name: "Greenwood",
      admins: [{ id: "a1" }],
      teachers: [],
      students: [{ userId: "su1" }],
    });
    mockUserFindMany.mockResolvedValue([
      { id: "a1", student: null, adminSchools: [{ id: "s1" }], teacherSchools: [] },
      { id: "su1", student: { schoolId: "s1" }, adminSchools: [], teacherSchools: [] },
    ]);
    const res = await DELETE(makeRequest({ schoolName: "Greenwood" }), { params });
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await DELETE(makeRequest({ schoolName: "Greenwood" }), { params });
    expect(res.status).toBe(500);
  });
});
