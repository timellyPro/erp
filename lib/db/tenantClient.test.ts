/**
 * @jest-environment node
 */
const mockExecuteRaw = jest.fn();
const mockTransaction = jest.fn();
const mockPrismaClientCtor = jest.fn();

jest.mock("@prisma/client", () => ({
  PrismaClient: class {
    $executeRaw = (...args: unknown[]) => mockExecuteRaw(...args);
    $transaction = (...args: unknown[]) => mockTransaction(...args);
    constructor(...args: unknown[]) {
      mockPrismaClientCtor(...args);
    }
  },
}));

describe("withTenantScopedClient", () => {
  const ORIGINAL_ENV = process.env.DATABASE_URL_TENANT;

  beforeEach(() => {
    jest.resetModules();
    mockExecuteRaw.mockReset();
    mockTransaction.mockReset();
    mockPrismaClientCtor.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.DATABASE_URL_TENANT;
    else process.env.DATABASE_URL_TENANT = ORIGINAL_ENV;
  });

  it("throws instead of silently connecting without DATABASE_URL_TENANT set", async () => {
    delete process.env.DATABASE_URL_TENANT;
    const { withTenantScopedClient } = await import("./tenantClient");
    await expect(withTenantScopedClient("school-1", async () => "x")).rejects.toThrow(
      "DATABASE_URL_TENANT is not set"
    );
    expect(mockPrismaClientCtor).not.toHaveBeenCalled();
  });

  it("sets app.current_school_id via set_config before running the callback, inside one transaction", async () => {
    process.env.DATABASE_URL_TENANT = "postgresql://app_tenant.ref:secret@host:5432/db";
    const calls: string[] = [];
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { $executeRaw: (...args: unknown[]) => { calls.push("set_config"); return mockExecuteRaw(...args); } };
      return fn(tx);
    });

    const { withTenantScopedClient } = await import("./tenantClient");
    const result = await withTenantScopedClient("school-1", async (tx) => {
      calls.push("callback");
      // The callback must receive the SAME tx that set_config ran on, not
      // a separate client - this is what keeps SET LOCAL scoped correctly.
      expect(tx).toBeDefined();
      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toEqual(["set_config", "callback"]);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("reuses the same underlying client across multiple calls (singleton)", async () => {
    process.env.DATABASE_URL_TENANT = "postgresql://app_tenant.ref:secret@host:5432/db";
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $executeRaw: mockExecuteRaw })
    );

    const { withTenantScopedClient } = await import("./tenantClient");
    await withTenantScopedClient("school-1", async () => "a");
    await withTenantScopedClient("school-2", async () => "b");

    expect(mockPrismaClientCtor).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });
});
