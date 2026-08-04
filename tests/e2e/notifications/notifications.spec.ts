import { test, expect } from '../../fixtures/test.fixture';

test.describe('Notification Center', () => {
  test('should load notifications page', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.locator('h1:has-text("Notification Center")')).toBeVisible();
  });
});
