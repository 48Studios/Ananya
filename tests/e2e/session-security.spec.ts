import { test, expect } from '@playwright/test';

test.describe('Authentication & Session Security Suite', () => {
  test('unauthenticated users accessing protected routes are redirected to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/maintenance');
    await expect(page).toHaveURL(/\/login/);
  });

  test('expired session parameters display security alert banner on login page', async ({ page }) => {
    await page.goto('/login?expired=true');
    await expect(page.getByText('Your session has expired. Please sign in again.')).toBeVisible();
  });

  test('successful login sets session token and renders ERP dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'jrsarath@48studios.internal');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');

    // Should redirect to dashboard and show user profile
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Ananya ERP')).toBeVisible();
  });
});
