import { test, expect } from "../../fixtures/test.fixture";

test.describe("Manufacturing Module", () => {
  test("should render work orders page", async ({ page }) => {
    await page.goto("/work-orders");
    await expect(page.locator('h1:has-text("Work Orders")')).toBeVisible();
  });
});
