import { test, expect } from '../../fixtures/test.fixture';

test.describe('Procurement Module', () => {
  test('should render purchase orders page', async ({ page }) => {
    await page.goto('/purchase-orders');
    await expect(page.locator('h1:has-text("Purchase Orders")')).toBeVisible();
  });
});
