import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../page-objects/LoginPage";
import { DashboardPage } from "../page-objects/DashboardPage";
import { ComponentsPage } from "../page-objects/ComponentsPage";
import { SettingsPage } from "../page-objects/SettingsPage";
import { e2eAdminCredentials } from "../e2e/auth-credentials";

/**
 * Skips the current test (or hook) unless E2E admin credentials are configured.
 *
 * Authenticated specs reuse the session written by `tests/global-setup.ts`, so
 * without `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` they must skip rather than
 * fail on the login redirect. Public specs (login, setup) never call this.
 *
 * Usage: `test.beforeEach(() => requireE2EAuth());` for a fully authenticated
 * file, or call it inside a single test in a mixed file.
 */
export function requireE2EAuth(): void {
  test.skip(
    !e2eAdminCredentials,
    "Requires E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see docs/development/TESTING.md).",
  );
}

type CustomFixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  componentsPage: ComponentsPage;
  settingsPage: SettingsPage;
};

export const test = base.extend<CustomFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  componentsPage: async ({ page }, use) => {
    await use(new ComponentsPage(page));
  },
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
  },
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(`Console error: ${msg.text()}`);
    }
  });

  page.on("pageerror", (exception) => {
    errors.push(`Unhandled exception: ${exception.message}`);
  });
});

export { expect };
