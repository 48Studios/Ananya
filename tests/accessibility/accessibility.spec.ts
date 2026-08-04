import { test, expect } from '../fixtures/test.fixture';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Audits (a11y)', () => {
  test('should pass accessibility checks on /login', async ({ page }) => {
    await page.goto('/login');
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should pass accessibility checks on /dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
