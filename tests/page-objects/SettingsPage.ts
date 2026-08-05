import { Page, Locator, expect } from "@playwright/test";

export class SettingsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1:has-text("System Settings")');
    this.saveButton = page.locator('button:has-text("Save")');
  }

  async goto() {
    await this.page.goto("/settings");
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }
}
