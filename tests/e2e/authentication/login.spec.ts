import { test, expect } from '../../fixtures/test.fixture';

test.describe('Authentication & Security Bounds', () => {
  test('should render login page correctly without any ERP chrome', async ({ loginPage, page }) => {
    await loginPage.goto();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();

    // Verify authenticated ERP layout elements are completely absent
    await expect(page.locator('aside')).not.toBeVisible();
    await expect(page.locator('header')).not.toBeVisible();
    await expect(page.locator('nav')).not.toBeVisible();
  });

  test('should show error on invalid credentials', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('invalid@48studios.com', 'wrongpassword');
    await loginPage.expectError();
  });

  test('should redirect unauthenticated user from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('aside')).not.toBeVisible();
    await expect(page.locator('header')).not.toBeVisible();
  });

  test('should redirect unauthenticated user from /components to /login', async ({ page }) => {
    await page.goto('/components');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should redirect unauthenticated user from /settings to /login', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login/);
  });
});
