import { test, expect } from "@playwright/test";
import { e2eAdminCredentials } from "./auth-credentials";

test.describe("Authentication & Session Security Suite", () => {
  test("unauthenticated users accessing protected routes are redirected to login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/maintenance");
    await expect(page).toHaveURL(/\/login/);
  });

  test("expired session parameters display security alert banner on login page", async ({
    page,
  }) => {
    await page.goto("/login?expired=true");
    await expect(
      page.getByText("Your session has expired. Please sign in again."),
    ).toBeVisible();
  });

  test("successful login sets session token and renders ERP dashboard", async ({
    page,
  }) => {
    test.skip(
      !e2eAdminCredentials,
      "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run authenticated login checks.",
    );
    if (!e2eAdminCredentials) return;

    await page.goto("/login");
    await page.fill('input[type="email"]', e2eAdminCredentials.email);
    await page.fill('input[type="password"]', e2eAdminCredentials.password);
    await page.click('button[type="submit"]');

    // Should redirect to dashboard and show user profile
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("Ananya ERP")).toBeVisible();
  });
});
