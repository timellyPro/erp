/**
 * @jest-environment node
 */
import { GET, PUT } from "@/app/api/superadmin/backup-schedule/route";

const mockGetServerSession = jest.fn();
const mockGetOrCreateBackupSchedule = jest.fn();
const mockSchoolFindUnique = jest.fn();
const mockBackupEmailScheduleUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/sendFeesBackupEmail", () => ({
  getOrCreateBackupSchedule: (...args: unknown[]) => mockGetOrCreateBackupSchedule(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args) },
    backupEmailSchedule: { update: (...args: unknown[]) => mockBackupEmailScheduleUpdate(...args) },
  },
}));

const putRequest = (body: unknown) =>
  new Request("http://localhost/api/superadmin/backup-schedule", {
    method: "PUT",
    body: JSON.stringify(body),
  });

const superadminSession = { user: { id: "u1", role: "SUPERADMIN" } };

const existingSchedule = {
  id: "sched1",
  enabled: true,
  scheduleTime: "06:00",
  recipient: "ops@example.com",
  schoolId: null,
  school: null,
  lastSentAt: null,
};

describe("GET /api/superadmin/backup-schedule", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockGetOrCreateBackupSchedule.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-superadmin session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the schedule mapped for the client", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockGetOrCreateBackupSchedule.mockResolvedValue({
      ...existingSchedule,
      lastSentAt: new Date("2024-01-01T00:00:00.000Z"),
      school: { id: "s1", name: "Test School" },
      schoolId: "s1",
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.schedule).toMatchObject({
      id: "sched1",
      enabled: true,
      schoolName: "Test School",
      lastSentAt: "2024-01-01T00:00:00.000Z",
    });
  });
});

describe("PUT /api/superadmin/backup-schedule", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockGetOrCreateBackupSchedule.mockReset().mockResolvedValue(existingSchedule);
    mockSchoolFindUnique.mockReset();
    mockBackupEmailScheduleUpdate.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PUT(putRequest({ enabled: false }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-superadmin session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await PUT(putRequest({ enabled: false }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid scheduleTime", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    const res = await PUT(putRequest({ scheduleTime: "25:99" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid recipient email", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    const res = await PUT(putRequest({ recipient: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the given schoolId does not exist", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockSchoolFindUnique.mockResolvedValue(null);
    const res = await PUT(putRequest({ schoolId: "missing-school" }));
    expect(res.status).toBe(404);
  });

  it("clears schoolId when an empty string is sent", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockBackupEmailScheduleUpdate.mockResolvedValue({ ...existingSchedule, schoolId: null });
    const res = await PUT(putRequest({ schoolId: "" }));
    expect(res.status).toBe(200);
    expect(mockBackupEmailScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { schoolId: null } })
    );
  });

  it("normalizes scheduleTime to zero-padded HH:mm", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockBackupEmailScheduleUpdate.mockResolvedValue({ ...existingSchedule, scheduleTime: "06:05" });
    const res = await PUT(putRequest({ scheduleTime: "6:05" }));
    expect(res.status).toBe(200);
    expect(mockBackupEmailScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { scheduleTime: "06:05" } })
    );
  });

  it("updates enabled/recipient/schoolId together and returns the mapped schedule", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockSchoolFindUnique.mockResolvedValue({ id: "s1" });
    mockBackupEmailScheduleUpdate.mockResolvedValue({
      ...existingSchedule,
      enabled: false,
      recipient: "new@example.com",
      schoolId: "s1",
      school: { id: "s1", name: "Test School" },
    });

    const res = await PUT(
      putRequest({ enabled: false, recipient: "new@example.com", schoolId: "s1" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.schedule).toMatchObject({
      enabled: false,
      recipient: "new@example.com",
      schoolId: "s1",
      schoolName: "Test School",
    });
    expect(mockBackupEmailScheduleUpdate).toHaveBeenCalledWith({
      where: { id: "sched1" },
      data: { enabled: false, recipient: "new@example.com", schoolId: "s1" },
      include: { school: { select: { id: true, name: true } } },
    });
  });
});
