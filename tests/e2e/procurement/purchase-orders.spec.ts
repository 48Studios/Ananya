import { test, expect, requireE2EAuth } from "../../fixtures/test.fixture";
test.beforeEach(() => requireE2EAuth());

test.describe("Procurement Module", () => {
  test("should render purchase orders page", async ({ page }) => {
    await page.goto("/procurement/purchase-orders");
    await expect(page.locator('h1:has-text("Purchase Orders")')).toBeVisible();
  });
});
