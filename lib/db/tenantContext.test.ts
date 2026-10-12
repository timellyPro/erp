/**
 * @jest-environment node
 */
const mockOwnerFind = jest.fn();
const mockTxFind = jest.fn();
const mockWith = jest.fn(async (_id: string, fn: (tx: unknown) => unknown, _o?: unknown) =>
  fn({ user: { findMany: mockTxFind } })
);

jest.mock("@/lib/db", () => ({ __esModule: true, default: { user: { findMany: (...a: unknown[]) => mockOwnerFind(...a) } } }));
jest.mock("@/lib/db/tenantClient", () => ({ withTenantScopedClient: (...a: Parameters<typeof mockWith>) => mockWith(...a) }));

import { runInTenantScope, tenantDb, isInTenantScope } from "@/lib/db/tenantContext";

describe("tenantContext", () => {
  beforeEach(() => { mockOwnerFind.mockReset().mockResolvedValue(["owner"]); mockTxFind.mockReset().mockResolvedValue(["tx"]); mockWith.mockClear(); });

  it("falls back to the owner client outside a scope", async () => {
    expect(isInTenantScope()).toBe(false);
    expect(await tenantDb.user.findMany()).toEqual(["owner"]);
    expect(mockWith).not.toHaveBeenCalled();
  });

  it("routes queries through the tenant tx inside a scope, including across awaits", async () => {
    const out = await runInTenantScope("s1", async () => {
      await Promise.resolve();
      return tenantDb.user.findMany();
    });
    expect(out).toEqual(["tx"]);
    expect(mockWith).toHaveBeenCalledWith("s1", expect.any(Function), expect.objectContaining({ timeout: 30000 }));
    expect(mockOwnerFind).not.toHaveBeenCalled();
  });

  it("reuses the existing scope when nested", async () => {
    await runInTenantScope("s1", () => runInTenantScope("s1", async () => tenantDb.user.findMany()));
    expect(mockWith).toHaveBeenCalledTimes(1);
  });
});
