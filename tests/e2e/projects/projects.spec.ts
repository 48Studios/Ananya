import { test, expect } from "../../fixtures/test.fixture";

test.describe("Projects Module", () => {
  test("should render projects page", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible();
  });
});
