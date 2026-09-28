import { test, expect } from "@playwright/test";
import { e2eAdminCredentials } from "./auth-credentials";

test.describe("Authentication State Machine Suite", () => {
  test("creating an organization automatically authenticates user without showing login screen", async ({
    page,
  }) => {
    await page.goto("/onboarding/create");

    await page.fill('input[placeholder="Jane"]', "StateOwner");
    await page.fill('input[placeholder="Smith"]', "StateLast");
    await page.fill(
      'input[placeholder="owner@example.com"]',
      `stateowner-${Date.now()}@example.test`,
    );
    await page.fill('input[placeholder="••••••••••••"]', "StatePass123!");
    await page.click('button:has-text("Next: Organization Details")');

    await page.fill(
      'input[placeholder="e.g. ACME Manufacturing"]',
      "ACME Manufacturing",
    );
    await page.click('button:has-text("Create Organization & Launch")');

    // Automatically enters dashboard without showing login
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("authenticated user session survives page reload", async ({ page }) => {
    test.skip(
      !e2eAdminCredentials,
      "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run authenticated login checks.",
    );
    if (!e2eAdminCredentials) return;

    await page.goto("/login");
    await page.fill('input[type="email"]', e2eAdminCredentials.email);
    await page.fill('input[type="password"]', e2eAdminCredentials.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard/);

    // Reload page
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
