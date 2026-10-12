import { checkTenantIsolation } from "./checkTenantIsolation";

/**
 * Runs the tenant-isolation heuristic (see checkTenantIsolation.ts) as part of the
 * regular `npx jest` suite, so a route that queries a tenant-scoped model without
 * ever deriving schoolId gets caught in CI, not just when someone remembers to run
 * the script by hand.
 */
describe("tenant isolation safety net", () => {
  it("finds no tenant-scoped model usage missing schoolId scoping", () => {
    const { offenders, routeFileCount, tenantModelCount } = checkTenantIsolation();

    expect(routeFileCount).toBeGreaterThan(0);
    expect(tenantModelCount).toBeGreaterThan(0);

    if (offenders.length > 0) {
      const details = offenders
        .map((o) => `  - ${o.file} (models: ${o.models.join(", ")})`)
        .join("\n");
      throw new Error(
        `${offenders.length} route(s) query a tenant-scoped model without mentioning ` +
          `"schoolId" anywhere in the file:\n${details}\n\n` +
          `If this is intentionally cross-tenant, add it to ALLOWLIST in ` +
          `scripts/checkTenantIsolation.ts with a comment explaining why. Otherwise, ` +
          `scope the query via requireSchoolId() (lib/auth/tenant.ts) before merging.`
      );
    }
  });

  it("finds no route reading a client-supplied schoolId from the request instead of the session (regression: app/api/fees/discount-approvals/route.ts used to fall back to ?schoolId=)", () => {
    const { clientSchoolIdOffenders } = checkTenantIsolation();

    if (clientSchoolIdOffenders.length > 0) {
      const details = clientSchoolIdOffenders
        .map((o) => `  - ${o.file} (source: ${o.kind})`)
        .join("\n");
      throw new Error(
        `${clientSchoolIdOffenders.length} route(s) read schoolId from the request instead ` +
          `of the session:\n${details}\n\n` +
          `Use requireSchoolId(session) (lib/auth/tenant.ts) instead. If the route is ` +
          `deliberately cross-tenant and re-validates the id, add it to ` +
          `CLIENT_SCHOOL_ID_ALLOWLIST in scripts/checkTenantIsolation.ts with a comment ` +
          `explaining why.`
      );
    }
  });
});
