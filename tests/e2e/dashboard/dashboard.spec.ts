import { test, expect, requireE2EAuth } from "../../fixtures/test.fixture";
test.beforeEach(() => requireE2EAuth());

test.describe("Dashboard Platform", () => {
  test("should render dashboard and widgets", async ({ dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.expectLoaded();
    await expect(dashboardPage.customizeButton).toBeVisible();
  });
});
