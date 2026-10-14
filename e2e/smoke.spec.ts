import { test, expect, type Page } from "@playwright/test";

/**
 * READ-ONLY smoke tests: no data is created or changed, so they are safe to point at
 * production. Authenticated tests use dedicated accounts supplied via env and skip
 * when absent:
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *   E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD
 *   E2E_PARENT_EMAIL / E2E_PARENT_PASSWORD
 */

async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByPlaceholder("Enter your school email").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

test.describe("public", () => {
  test("health endpoint reports ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database).toBe("ok");
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Enter your school email")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("privacy policy page is reachable", async ({ request }) => {
    expect((await request.get("/privacy-policy")).status()).toBe(200);
  });
});

test.describe("auth is enforced", () => {
  for (const path of [
    "/api/fees/mine",
    "/api/fees/summary",
    "/api/attendance/view",
    "/api/teacher/dashboard",
  ]) {
    test(`${path} rejects anonymous requests`, async ({ request }) => {
      const res = await request.get(path);
      expect([401, 403]).toContain(res.status());
    });
  }

  test("wrong password does not log in", async ({ page }) => {
    await login(page, "nobody@example.invalid", "definitely-wrong");
    await page.waitForTimeout(2000);
    await expect(page.getByPlaceholder("Enter your school email")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });
});

const roles = [
  { name: "school admin", prefix: "E2E_ADMIN" },
  { name: "teacher", prefix: "E2E_TEACHER" },
  { name: "parent", prefix: "E2E_PARENT" },
];

for (const { name, prefix } of roles) {
  test.describe(`${name} journey`, () => {
    const email = process.env[`${prefix}_EMAIL`];
    const password = process.env[`${prefix}_PASSWORD`];
    test.skip(!email || !password, `${prefix}_EMAIL / ${prefix}_PASSWORD not set`);

    test("logs in, lands on a portal and the page does not crash", async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));

      await login(page, email!, password!);
      await expect(page).not.toHaveURL(/\/$/, { timeout: 20_000 });
      await expect(page).not.toHaveURL(/unauthorized/);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    });

    test("session API returns this user", async ({ page }) => {
      await login(page, email!, password!);
      await expect(page).not.toHaveURL(/\/$/, { timeout: 20_000 });
      const session = await page.request.get("/api/auth/session");
      const body = await session.json();
      expect(body?.user?.email?.toLowerCase()).toBe(email!.toLowerCase());
    });
  });
}

test.describe("core reads (authenticated, read-only)", () => {
  const email = process.env.E2E_PARENT_EMAIL;
  const password = process.env.E2E_PARENT_PASSWORD;
  test.skip(!email || !password, "E2E_PARENT_* not set");

  test("parent can load their fee details", async ({ page }) => {
    await login(page, email!, password!);
    await expect(page).not.toHaveURL(/\/$/, { timeout: 20_000 });
    const res = await page.request.get("/api/fees/mine");
    expect(res.status()).toBe(200);
  });
});

test.describe("attendance read (authenticated, read-only)", () => {
  const email = process.env.E2E_TEACHER_EMAIL;
  const password = process.env.E2E_TEACHER_PASSWORD;
  test.skip(!email || !password, "E2E_TEACHER_* not set");

  test("teacher dashboard API responds", async ({ page }) => {
    await login(page, email!, password!);
    await expect(page).not.toHaveURL(/\/$/, { timeout: 20_000 });
    const res = await page.request.get("/api/teacher/dashboard");
    expect(res.status()).toBeLessThan(500);
  });
});
