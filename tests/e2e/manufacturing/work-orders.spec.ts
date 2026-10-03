import { test, expect, requireE2EAuth } from "../../fixtures/test.fixture";
test.beforeEach(() => requireE2EAuth());

test.describe("Manufacturing Module", () => {
  test("should render work orders page", async ({ page }) => {
    await page.goto("/manufacturing/work-orders");
    await expect(page.locator('h1:has-text("Work Orders")')).toBeVisible();
  });
});
