import { test, expect } from "../../fixtures/test.fixture";

test.describe("Dashboard Platform", () => {
  test("should render dashboard and widgets", async ({ dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.expectLoaded();
    await expect(dashboardPage.customizeButton).toBeVisible();
  });
});
