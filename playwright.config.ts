import { defineConfig } from "@playwright/test";

// Smoke tests run against an already-deployed URL (never starts a server, never
// touches the DB directly). Default is local dev; point at staging/prod with E2E_BASE_URL.
// Authenticated tests need E2E_*_EMAIL / E2E_*_PASSWORD and skip themselves otherwise.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
