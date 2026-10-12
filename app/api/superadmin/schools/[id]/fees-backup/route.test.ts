/**
 * @jest-environment node
 */
import { GET } from "@/app/api/superadmin/schools/[id]/fees-backup/route";

const mockGetServerSession = jest.fn();
const mockGenerateSchoolFeesBackupBuffer = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/generateSchoolFeesBackupBuffer", () => ({
  generateSchoolFeesBackupBuffer: (...args: unknown[]) => mockGenerateSchoolFeesBackupBuffer(...args),
}));

const ctx = { params: Promise.resolve({ id: "s1" }) };
const request = () => new Request("http://localhost/api/superadmin/schools/s1/fees-backup");

const superadminSession = { user: { id: "u1", role: "SUPERADMIN" } };

describe("GET /api/superadmin/schools/[id]/fees-backup", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockGenerateSchoolFeesBackupBuffer.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-superadmin session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await GET(request(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the school is not found", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockGenerateSchoolFeesBackupBuffer.mockResolvedValue(null);
    const res = await GET(request(), ctx);
    expect(res.status).toBe(404);
    expect(mockGenerateSchoolFeesBackupBuffer).toHaveBeenCalledWith("s1");
  });

  it("streams the workbook with the expected headers and filename", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockGenerateSchoolFeesBackupBuffer.mockResolvedValue({
      buffer: Buffer.from("fake-xlsx-bytes"),
      filename: "school-s1-fees-backup.xlsx",
    });
    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="school-s1-fees-backup.xlsx"'
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString()).toBe("fake-xlsx-bytes");
  });

  it("returns 500 when backup generation throws", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockGenerateSchoolFeesBackupBuffer.mockRejectedValue(new Error("generation failed"));
    const res = await GET(request(), ctx);
    expect(res.status).toBe(500);
  });
});
