/**
 * @jest-environment node
 *
 * Regression test for the connection-pool sizing bug fixed in this file:
 * connection_limit was previously 1 in production / 2 in dev for the PgBouncer
 * pooler, which forced every Promise.all([...]) fan-out to serialize through a
 * single connection (measured: a ~5ms-server-side query batch took 6-9s of
 * client-side queueing). Pool sizes must stay above that floor.
 */

const mockPrismaClient = jest.fn();

jest.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor(opts: unknown) {
      mockPrismaClient(opts);
    }
    $extends() {
      return this;
    }
    async $disconnect() {
      return undefined;
    }
  },
}));

jest.mock("@/lib/cache/redis", () => ({
  bumpTenantCacheVersion: jest.fn(),
}));

function loadDbWithEnv(env: Record<string, string | undefined>) {
  const original = { ...process.env };
  Object.keys(process.env).forEach((k) => {
    if (k.startsWith("DATABASE_URL") || k.startsWith("DIRECT_URL") || k === "PRISMA_CONNECTION_LIMIT" || k === "NODE_ENV") {
      delete process.env[k];
    }
  });
  Object.assign(process.env, env);
  jest.resetModules();
  mockPrismaClient.mockClear();
  // globalThis singleton caching survives resetModules (it's outside the module
  // registry) — clear it so each case builds a fresh client instead of reusing
  // one made under a previous test's env.
  delete (globalThis as { prismaGlobal?: unknown }).prismaGlobal;
  delete (globalThis as { prismaConnectionString?: unknown }).prismaConnectionString;
  require("@/lib/db");
  const connectionString = mockPrismaClient.mock.calls[0]?.[0]?.datasourceUrl as string;
  process.env = original;
  return connectionString;
}

describe("lib/db connection pool sizing", () => {
  it("uses a pool well above 1 for the PgBouncer pooler in production", () => {
    const url = loadDbWithEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:6543/postgres?pgbouncer=true",
    });
    const match = url.match(/connection_limit=(\d+)/);
    expect(match).not.toBeNull();
    const limit = Number(match![1]);
    expect(limit).toBeGreaterThan(1);
  });

  it("uses a pool well above 2 for the PgBouncer pooler in development", () => {
    const url = loadDbWithEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user:pass@host:6543/postgres?pgbouncer=true",
    });
    const match = url.match(/connection_limit=(\d+)/);
    expect(match).not.toBeNull();
    const limit = Number(match![1]);
    expect(limit).toBeGreaterThan(2);
  });

  it("prefers the pooled DATABASE_URL over the unpooled DIRECT_URL when both are set", () => {
    const url = loadDbWithEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user:pass@pooler-host:6543/postgres?pgbouncer=true",
      DIRECT_URL: "postgresql://user:pass@direct-host:5432/postgres",
    });
    expect(url).toContain("pooler-host");
    expect(url).not.toContain("direct-host");
  });

  it("respects an explicit PRISMA_CONNECTION_LIMIT override", () => {
    const url = loadDbWithEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:6543/postgres?pgbouncer=true",
      PRISMA_CONNECTION_LIMIT: "20",
    });
    expect(url).toContain("connection_limit=20");
  });
});
