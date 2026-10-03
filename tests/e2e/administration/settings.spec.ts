import { test, expect, requireE2EAuth } from "../../fixtures/test.fixture";
test.beforeEach(() => requireE2EAuth());

test.describe("Administration Hub", () => {
  test("should render system settings hub", async ({ settingsPage }) => {
    await settingsPage.goto();
    await settingsPage.expectLoaded();
  });
});
