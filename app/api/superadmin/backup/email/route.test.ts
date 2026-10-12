/**
 * @jest-environment node
 */
import { POST } from "@/app/api/superadmin/backup/email/route";

const mockGetServerSession = jest.fn();
const mockGetOrCreateBackupSchedule = jest.fn();
const mockSendFeesBackupEmail = jest.fn();
const mockBackupEmailScheduleUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/sendFeesBackupEmail", () => ({
  getOrCreateBackupSchedule: (...args: unknown[]) => mockGetOrCreateBackupSchedule(...args),
  sendFeesBackupEmail: (...args: unknown[]) => mockSendFeesBackupEmail(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    backupEmailSchedule: { update: (...args: unknown[]) => mockBackupEmailScheduleUpdate(...args) },
  },
}));

const request = (body: unknown = {}) =>
  new Request("http://localhost/api/superadmin/backup/email", {
    method: "POST",
    body: JSON.stringify(body),
  });

const superadminSession = { user: { id: "u1", role: "SUPERADMIN" } };

const schedule = { id: "sched1", recipient: "ops@example.com", schoolId: null };

describe("POST /api/superadmin/backup/email", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockGetOrCreateBackupSchedule.mockReset().mockResolvedValue(schedule);
    mockSendFeesBackupEmail.mockReset();
    mockBackupEmailScheduleUpdate.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-superadmin session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await POST(request());
    expect(res.status).toBe(403);
  });

  it("uses the schedule's saved recipient/schoolId when the body omits them", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockSendFeesBackupEmail.mockResolvedValue({
      ok: true,
      recipient: "ops@example.com",
      schoolsSent: ["School A"],
      messageId: "m1",
    });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(mockSendFeesBackupEmail).toHaveBeenCalledWith({ recipient: "ops@example.com", schoolId: null });
  });

  it("overrides the recipient and schoolId from the request body", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockSendFeesBackupEmail.mockResolvedValue({
      ok: true,
      recipient: "override@example.com",
      schoolsSent: ["School B"],
      messageId: "m2",
    });
    const res = await POST(request({ recipient: "override@example.com", schoolId: "s2" }));
    expect(res.status).toBe(200);
    expect(mockSendFeesBackupEmail).toHaveBeenCalledWith({ recipient: "override@example.com", schoolId: "s2" });
  });

  it("returns 500 with the send helper's error message on failure and does not touch lastSentAt", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockSendFeesBackupEmail.mockResolvedValue({ ok: false, error: "SMTP failure" });
    const res = await POST(request());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toBe("SMTP failure");
    expect(mockBackupEmailScheduleUpdate).not.toHaveBeenCalled();
  });

  it("marks lastSentAt and returns the send result on success", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockSendFeesBackupEmail.mockResolvedValue({
      ok: true,
      recipient: "ops@example.com",
      schoolsSent: ["School A", "School B"],
      messageId: "m3",
    });
    const res = await POST(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      message: "Backup email sent",
      recipient: "ops@example.com",
      schoolsSent: ["School A", "School B"],
      messageId: "m3",
    });
    expect(mockBackupEmailScheduleUpdate).toHaveBeenCalledWith({
      where: { id: "sched1" },
      data: { lastSentAt: expect.any(Date) },
    });
  });
});
