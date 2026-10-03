import { test, expect, requireE2EAuth } from "../../fixtures/test.fixture";
test.beforeEach(() => requireE2EAuth());

test.describe("Inventory Module", () => {
  test("should render components list", async ({ componentsPage }) => {
    await componentsPage.goto();
    await componentsPage.expectLoaded();
  });
});
