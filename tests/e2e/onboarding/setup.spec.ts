import { test, expect } from '../../fixtures/test.fixture';

test.describe('Organization Setup Wizard', () => {
  test('should load setup page', async ({ page }) => {
    await page.goto('/setup');
    await expect(page.locator('h2:has-text("Organization Setup Wizard")')).toBeVisible();
    await expect(page.locator('input[placeholder="48 Studios"]')).toBeVisible();
  });
});
