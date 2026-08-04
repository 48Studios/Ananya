import { test, expect } from '../../fixtures/test.fixture';

test.describe('Global Search & Command Center', () => {
  test('should open command palette on ⌘K keyboard shortcut', async ({ page }) => {
    await page.goto('/dashboard');
    await page.keyboard.press('Meta+k');
    await expect(page.locator('input[placeholder*="Type a command or search"]')).toBeVisible();
  });
});
