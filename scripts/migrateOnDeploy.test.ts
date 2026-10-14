/** @jest-environment node */
import { spawnSync } from "child_process";
import path from "path";

const script = path.join(__dirname, "migrate-on-deploy.js");

function run(env: Record<string, string | undefined>) {
  // Minimal env on purpose: the real DATABASE_URL/DIRECT_URL from the developer's shell or .env must never leak in.
  const r = spawnSync(process.execPath, [script], {
    env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("migrate-on-deploy", () => {
  it("skips outside Vercel production builds (local, CI, preview)", () => {
    const cases: Record<string, string>[] = [{}, { VERCEL_ENV: "preview", DIRECT_URL: "x" }, { VERCEL_ENV: "development", DIRECT_URL: "x" }];
    for (const env of cases) {
      const r = run(env);
      expect(r.status).toBe(0);
      expect(r.out).toContain("skipped");
    }
  });

  it("honours SKIP_MIGRATE_ON_DEPLOY=1 even in production", () => {
    const r = run({ VERCEL_ENV: "production", DIRECT_URL: "x", SKIP_MIGRATE_ON_DEPLOY: "1" });
    expect(r.status).toBe(0);
    expect(r.out).toContain("SKIP_MIGRATE_ON_DEPLOY");
  });

  it("skips when no database URL is configured", () => {
    const r = run({ VERCEL_ENV: "production" });
    expect(r.status).toBe(0);
    expect(r.out).toContain("no DIRECT_URL or DATABASE_URL");
  });
});
