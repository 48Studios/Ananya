import { test, expect, requireE2EAuth } from "../../fixtures/test.fixture";
test.beforeEach(() => requireE2EAuth());

test.describe("Global Search & Command Center", () => {
  test("should open command palette on Ctrl/⌘+K keyboard shortcut", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Wait for hydration: the shortcut listener is registered client-side, so a
    // key pressed before the header renders is simply lost.
    await expect(
      page.locator('button:has-text("Search or type command")'),
    ).toBeVisible();

    // Control+K is accepted by the handler on every platform, including
    // headless CI where the Meta key is not reliably delivered.
    await page.keyboard.press("Control+k");
    await expect(
      page.locator('input[placeholder*="Type a command or search"]'),
    ).toBeVisible();
  });
});
