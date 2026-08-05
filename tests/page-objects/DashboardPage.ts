import { Page, Locator, expect } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly customizeButton: Locator;
  readonly widgetGrid: Locator;
  readonly commandPaletteTrigger: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1:has-text("Dashboard")');
    this.customizeButton = page.locator('button:has-text("Customize")');
    this.widgetGrid = page.locator(".grid");
    this.commandPaletteTrigger = page.locator('button:has-text("Search")');
  }

  async goto() {
    await this.page.goto("/dashboard");
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async openCustomizeDrawer() {
    await this.customizeButton.click();
  }
}
