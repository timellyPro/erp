/**
 * @jest-environment node
 */
import { GET } from "@/app/api/student-leaves/approval-authority/route";

const mockGetServerSession = jest.fn();
const mockStudentFindUnique = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
  },
}));

describe("GET /api/student-leaves/approval-authority", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentFindUnique.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns an empty shell when no student record exists", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockStudentFindUnique.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ teacherName: null, photoUrl: null, className: null, section: null });
  });

  it("returns an empty shell when the student has no class", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "stu1" } });
    mockStudentFindUnique.mockResolvedValue({ id: "stu1", class: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.className).toBeNull();
  });

  it("returns class info without teacher fields when the class has no assigned teacher", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "stu1" } });
    mockStudentFindUnique.mockResolvedValue({
      id: "stu1",
      class: { id: "c1", name: "5", section: "A", teacher: null },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ classId: "c1", className: "5", section: "A", teacherName: null });
  });

  it("returns full teacher and class info when a teacher is assigned", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "stu1" } });
    mockStudentFindUnique.mockResolvedValue({
      id: "stu1",
      class: {
        id: "c1",
        name: "5",
        section: "A",
        teacher: { id: "t1", name: "Teacher One", email: "t1@x.com", photoUrl: "https://x/1.jpg" },
      },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      teacherId: "t1",
      teacherName: "Teacher One",
      teacherEmail: "t1@x.com",
      classId: "c1",
      className: "5",
      section: "A",
      photoUrl: "https://x/1.jpg",
    });
    expect(mockStudentFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "stu1" } })
    );
  });

  it("falls back to looking up the student by userId when the session has no studentId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockStudentFindUnique.mockResolvedValue({ id: "stu2", class: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockStudentFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "stu1" } });
    mockStudentFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
