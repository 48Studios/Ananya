import { test, expect } from "../../fixtures/test.fixture";

test.describe("Document & Attachment Management", () => {
  test("should render components attachment section", async ({ page }) => {
    await page.goto("/components");
    await expect(page.locator('h1:has-text("Components")')).toBeVisible();
  });
});
