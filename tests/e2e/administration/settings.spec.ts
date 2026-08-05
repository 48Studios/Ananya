import { test, expect } from "../../fixtures/test.fixture";

test.describe("Administration Hub", () => {
  test("should render system settings hub", async ({ settingsPage }) => {
    await settingsPage.goto();
    await settingsPage.expectLoaded();
  });
});
