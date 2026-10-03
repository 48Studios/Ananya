import { test, expect, requireE2EAuth } from "../../fixtures/test.fixture";
test.beforeEach(() => requireE2EAuth());

test.describe("Projects Module", () => {
  test("should render projects page", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible();
  });
});
