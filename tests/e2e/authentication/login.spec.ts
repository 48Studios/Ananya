import { test, expect } from "../../fixtures/test.fixture";
import { e2eAdminCredentials } from "../auth-credentials";

test.describe("Authentication & Security Bounds", () => {
  test("should render login page correctly without any ERP chrome", async ({
    loginPage,
    page,
  }) => {
    await loginPage.goto();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();

    // Verify authenticated ERP layout elements are completely absent
    await expect(page.locator("aside")).not.toBeVisible();
    await expect(page.locator("header")).not.toBeVisible();
    await expect(page.locator("nav")).not.toBeVisible();
  });

  test("should show error on invalid credentials", async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login("invalid@example.test", "wrongpassword");
    await loginPage.expectError();
  });

  test("should redirect unauthenticated user from /dashboard to /login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("aside")).not.toBeVisible();
    await expect(page.locator("header")).not.toBeVisible();
  });

  test("should redirect unauthenticated user from /inventory/components to /login", async ({
    page,
  }) => {
    await page.goto("/inventory/components");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should redirect unauthenticated user from /settings to /login", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should maintain authenticated session across browser refresh", async ({
    loginPage,
    page,
  }) => {
    test.skip(
      !e2eAdminCredentials,
      "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run authenticated login checks.",
    );
    if (!e2eAdminCredentials) return;

    await loginPage.goto();
    await loginPage.login(
      e2eAdminCredentials.email,
      e2eAdminCredentials.password,
    );
    await expect(page).toHaveURL(/\/(dashboard)?/);

    // Perform full browser page refresh
    await page.reload();

    // Verify user remains logged in and protected ERP page renders seamlessly
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("header")).toBeVisible();
  });
});
