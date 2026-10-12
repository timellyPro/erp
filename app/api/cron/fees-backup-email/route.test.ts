/**
 * @jest-environment node
 */
import { GET } from "@/app/api/cron/fees-backup-email/route";

const mockBackupEmailScheduleFindMany = jest.fn();
const mockBackupEmailScheduleUpdate = jest.fn();
const mockShouldRunScheduledBackup = jest.fn();
const mockSendFeesBackupEmail = jest.fn();

jest.mock("@/lib/backupScheduleUtils", () => ({
  shouldRunScheduledBackup: (...args: unknown[]) => mockShouldRunScheduledBackup(...args),
}));

jest.mock("@/lib/fees/sendFeesBackupEmail", () => ({
  sendFeesBackupEmail: (...args: unknown[]) => mockSendFeesBackupEmail(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    backupEmailSchedule: {
      findMany: (...args: unknown[]) => mockBackupEmailScheduleFindMany(...args),
      update: (...args: unknown[]) => mockBackupEmailScheduleUpdate(...args),
    },
  },
}));

const request = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/cron/fees-backup-email", { headers });

describe("GET /api/cron/fees-backup-email", () => {
  beforeEach(() => {
    mockBackupEmailScheduleFindMany.mockReset().mockResolvedValue([]);
    mockBackupEmailScheduleUpdate.mockReset();
    mockShouldRunScheduledBackup.mockReset();
    mockSendFeesBackupEmail.mockReset();
    process.env.CRON_SECRET = "secret123";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns 401 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(request({ authorization: "Bearer secret123" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the Authorization header does not match", async () => {
    const res = await GET(request({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when no Authorization header is sent", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("reports zero sent when there are no enabled schedules", async () => {
    const res = await GET(request({ authorization: "Bearer secret123" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ message: "No enabled backup schedules", sent: 0, results: [] });
  });

  it("skips a schedule that is not yet due and reports it in the results", async () => {
    mockBackupEmailScheduleFindMany.mockResolvedValue([
      { id: "sched1", scheduleTime: "06:00", lastSentAt: null, recipient: "a@x.com", schoolId: null },
    ]);
    mockShouldRunScheduledBackup.mockReturnValue(false);
    const res = await GET(request({ authorization: "Bearer secret123" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.results).toEqual([{ scheduleId: "sched1", ok: false, error: "Not due yet" }]);
    expect(mockSendFeesBackupEmail).not.toHaveBeenCalled();
  });

  it("sends the backup for a due schedule and marks lastSentAt", async () => {
    mockBackupEmailScheduleFindMany.mockResolvedValue([
      { id: "sched1", scheduleTime: "06:00", lastSentAt: null, recipient: "a@x.com", schoolId: "s1" },
    ]);
    mockShouldRunScheduledBackup.mockReturnValue(true);
    mockSendFeesBackupEmail.mockResolvedValue({ ok: true, schoolsSent: ["School A"] });

    const res = await GET(request({ authorization: "Bearer secret123" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(json.results).toEqual([{ scheduleId: "sched1", ok: true, schoolsSent: ["School A"] }]);
    expect(mockSendFeesBackupEmail).toHaveBeenCalledWith({ recipient: "a@x.com", schoolId: "s1" });
    expect(mockBackupEmailScheduleUpdate).toHaveBeenCalledWith({
      where: { id: "sched1" },
      data: { lastSentAt: expect.any(Date) },
    });
  });

  it("records a failed send without updating lastSentAt", async () => {
    mockBackupEmailScheduleFindMany.mockResolvedValue([
      { id: "sched1", scheduleTime: "06:00", lastSentAt: null, recipient: "a@x.com", schoolId: null },
    ]);
    mockShouldRunScheduledBackup.mockReturnValue(true);
    mockSendFeesBackupEmail.mockResolvedValue({ ok: false, error: "SMTP failure" });

    const res = await GET(request({ authorization: "Bearer secret123" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.results).toEqual([{ scheduleId: "sched1", ok: false, error: "SMTP failure" }]);
    expect(mockBackupEmailScheduleUpdate).not.toHaveBeenCalled();
  });

  it("processes multiple schedules independently and totals only the successful sends", async () => {
    mockBackupEmailScheduleFindMany.mockResolvedValue([
      { id: "sched1", scheduleTime: "06:00", lastSentAt: null, recipient: "a@x.com", schoolId: null },
      { id: "sched2", scheduleTime: "07:00", lastSentAt: null, recipient: "b@x.com", schoolId: null },
    ]);
    mockShouldRunScheduledBackup.mockReturnValue(true);
    mockSendFeesBackupEmail
      .mockResolvedValueOnce({ ok: true, schoolsSent: ["School A"] })
      .mockResolvedValueOnce({ ok: false, error: "SMTP failure" });

    const res = await GET(request({ authorization: "Bearer secret123" }));
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(json.results).toHaveLength(2);
  });

  it("returns 500 when the database query throws", async () => {
    mockBackupEmailScheduleFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request({ authorization: "Bearer secret123" }));
    expect(res.status).toBe(500);
  });
});
