import { test, expect, requireE2EAuth } from "../../fixtures/test.fixture";
test.beforeEach(() => requireE2EAuth());

test.describe("Document & Attachment Management", () => {
  test("should render components attachment section", async ({ page }) => {
    await page.goto("/inventory/components");
    await expect(page.locator('h1:has-text("Components")')).toBeVisible();
  });
});
