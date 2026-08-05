import { test, expect } from "../../fixtures/test.fixture";

test.describe("Workflow Automation Engine", () => {
  test("should render workflow management page", async ({ page }) => {
    await page.goto("/workflows");
    await expect(
      page.locator('h1:has-text("Workflow Automation")'),
    ).toBeVisible();
  });
});
