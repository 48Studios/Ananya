import { test, expect } from "../../fixtures/test.fixture";

test.describe("Inventory Module", () => {
  test("should render components list", async ({ componentsPage }) => {
    await componentsPage.goto();
    await componentsPage.expectLoaded();
  });
});
