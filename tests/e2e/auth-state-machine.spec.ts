import { test, expect } from '@playwright/test';

test.describe('Authentication State Machine Suite', () => {
  test('creating an organization automatically authenticates user without showing login screen', async ({ page }) => {
    await page.goto('/onboarding/create');

    await page.fill('input[placeholder="Jane"]', 'StateOwner');
    await page.fill('input[placeholder="Smith"]', 'StateLast');
    await page.fill('input[placeholder="owner@company.com"]', `stateowner-${Date.now()}@acme.internal`);
    await page.fill('input[placeholder="••••••••••••"]', 'StatePass123!');
    await page.click('button:has-text("Next: Organization Details")');

    await page.fill('input[placeholder="e.g. Apex Hardware Technologies"]', 'State Machine Org');
    await page.click('button:has-text("Create Organization & Launch")');

    // Automatically enters dashboard without showing login
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('authenticated user session survives page reload', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'jrsarath@48studios.internal');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard/);

    // Reload page
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
