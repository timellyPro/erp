/**
 * @jest-environment node
 */
const mockFindUnique = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { authOptions } from "@/lib/auth/authOptions";

const jwtCallback = authOptions.callbacks!.jwt!;

const baseToken = {
  id: "user-1",
  role: "TEACHER",
  schoolId: "school-1",
  mobile: null,
  studentId: null,
  allowedFeatures: ["marks-entry"],
  image: null,
};

function staleToken(overrides: Record<string, unknown> = {}) {
  return {
    ...baseToken,
    _dbSyncAt: Date.now() - 10 * 60 * 1000, // > 5 min, triggers a sync attempt
    _lastSuccessfulSyncAt: Date.now() - 10 * 60 * 1000,
    ...overrides,
  };
}

describe("authOptions jwt callback", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("re-syncs role from the DB on a successful sync", async () => {
    mockFindUnique.mockResolvedValue({
      role: "SCHOOLADMIN",
      password: "hashed",
      schoolId: "school-1",
      allowedFeatures: ["marks-entry", "attendance-mark"],
      photoUrl: null,
      student: null,
      adminSchools: [],
      teacherSchools: [],
    });

    // @ts-expect-error - partial token/args are fine for this unit test
    const result = await jwtCallback({ token: staleToken() });

    expect(result.role).toBe("SCHOOLADMIN");
    expect(result.allowedFeatures).toEqual(["marks-entry", "attendance-mark"]);
    expect(typeof result._lastSuccessfulSyncAt).toBe("number");
  });

  it("invalidates the session immediately when the account is deactivated (password null)", async () => {
    mockFindUnique.mockResolvedValue({
      role: "TEACHER",
      password: null,
      schoolId: "school-1",
      allowedFeatures: [],
      photoUrl: null,
      student: null,
      adminSchools: [],
      teacherSchools: [],
    });

    // @ts-expect-error - partial token/args are fine for this unit test
    await expect(jwtCallback({ token: staleToken() })).rejects.toThrow(
      "account_deactivated"
    );
  });

  it("keeps the cached token on a transient DB failure within the staleness ceiling", async () => {
    mockFindUnique.mockRejectedValue(new Error("connection reset"));

    const token = staleToken({
      _lastSuccessfulSyncAt: Date.now() - 10 * 60 * 1000, // 10 min ago, well under the 60 min ceiling
    });

    // @ts-expect-error - partial token/args are fine for this unit test
    const result = await jwtCallback({ token });

    expect(result.role).toBe("TEACHER"); // unchanged, still usable
    expect(result.schoolId).toBe("school-1");
  });

  it("forces re-authentication once the staleness ceiling is exceeded", async () => {
    mockFindUnique.mockRejectedValue(new Error("connection reset"));

    const token = staleToken({
      _lastSuccessfulSyncAt: Date.now() - 61 * 60 * 1000, // over the 60 min ceiling
    });

    // @ts-expect-error - partial token/args are fine for this unit test
    await expect(jwtCallback({ token })).rejects.toThrow(
      "session_stale_ceiling_exceeded"
    );
  });

  it("does not query the DB when the token is fresh", async () => {
    const token = {
      ...baseToken,
      _dbSyncAt: Date.now(),
      _lastSuccessfulSyncAt: Date.now(),
    };

    // @ts-expect-error - partial token/args are fine for this unit test
    await jwtCallback({ token });

    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
