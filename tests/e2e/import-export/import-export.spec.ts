import { test, expect } from "../../fixtures/test.fixture";

test.describe("Import / Export Framework", () => {
  test("should render import trigger on components page", async ({ page }) => {
    await page.goto("/components");
    await expect(page.locator('button:has-text("Import")')).toBeVisible();
  });
});
