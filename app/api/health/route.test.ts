/**
 * @jest-environment node
 */
import { GET } from "@/app/api/health/route";

const mockQueryRaw = jest.fn();
const mockGetEnvProblems = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { $queryRaw: (...args: unknown[]) => mockQueryRaw(...args) },
}));
jest.mock("@/lib/env", () => ({ getEnvProblems: () => mockGetEnvProblems() }));
jest.mock("@/lib/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

describe("GET /api/health", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
    mockGetEnvProblems.mockReset().mockReturnValue([]);
  });

  it("returns 200 when the database and config are fine", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "ok", checks: { database: "ok", config: "ok" } });
  });

  it("returns 503 when the database query fails, without leaking the error", async () => {
    mockQueryRaw.mockRejectedValue(new Error("password authentication failed for user x"));
    const res = await GET();
    expect(res.status).toBe(503);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('"database":"fail"');
    expect(text).not.toContain("password");
  });

  it("returns 503 when required config is missing", async () => {
    mockQueryRaw.mockResolvedValue([]);
    mockGetEnvProblems.mockReturnValue(["CRON_SECRET is not set"]);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ checks: { config: "fail" } });
  });
});
