import { test, expect, requireE2EAuth } from "../../fixtures/test.fixture";
test.beforeEach(() => requireE2EAuth());

test.describe("Notification Center", () => {
  test("should load notifications page", async ({ page }) => {
    await page.goto("/notifications");
    await expect(
      page.locator('h1:has-text("Notification Center")'),
    ).toBeVisible();
  });
});
