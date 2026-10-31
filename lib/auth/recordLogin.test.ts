/**
 * @jest-environment node
 */
const mockCreate = jest.fn();
const mockLoggerError = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { loginAuditLog: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: (...args: unknown[]) => mockLoggerError(...args), warn: jest.fn() },
}));

import { clientIp, recordLogin } from "@/lib/auth/recordLogin";

const student = { id: "u1", role: "STUDENT", name: "Asha", email: "ADM/1", schoolId: "school-1", studentId: "s1" };

describe("recordLogin", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores the sign-in with the client IP and user agent", async () => {
    mockCreate.mockResolvedValue({});
    await recordLogin(student, { "x-forwarded-for": "49.37.1.2, 10.0.0.1", "user-agent": "UA" });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        schoolId: "school-1",
        userId: "u1",
        studentId: "s1",
        role: "STUDENT",
        name: "Asha",
        email: "ADM/1",
        ipAddress: "49.37.1.2",
        userAgent: "UA",
      },
    });
  });

  it("skips superadmins and users with no school", async () => {
    await recordLogin({ ...student, role: "SUPERADMIN", schoolId: null, studentId: null }, {});
    await recordLogin({ ...student, schoolId: null }, {});
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("never throws when the write fails", async () => {
    mockCreate.mockRejectedValue(new Error("db down"));
    await expect(recordLogin(student, undefined)).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalled();
  });
});

describe("clientIp", () => {
  it("falls back to x-real-ip", () => {
    expect(clientIp({ "x-real-ip": "1.2.3.4" })).toBe("1.2.3.4");
    expect(clientIp(undefined)).toBeNull();
  });
});
