import { test, expect } from "../fixtures/test.fixture";

test.describe("Visual Regression Testing", () => {
  test("should match dashboard snapshot", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    await expect(page).toHaveScreenshot("dashboard.png", {
      maxDiffPixelRatio: 0.05,
    });
  });

  test("should match login page snapshot", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.locator('h2:has-text("Sign in to your workspace")'),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("login.png", {
      maxDiffPixelRatio: 0.05,
    });
  });
});
