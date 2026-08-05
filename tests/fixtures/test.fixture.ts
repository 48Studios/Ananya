import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../page-objects/LoginPage";
import { DashboardPage } from "../page-objects/DashboardPage";
import { ComponentsPage } from "../page-objects/ComponentsPage";
import { SettingsPage } from "../page-objects/SettingsPage";

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
