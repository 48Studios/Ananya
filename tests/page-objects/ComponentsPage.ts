import { Page, Locator, expect } from "@playwright/test";

export class ComponentsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly tableRows: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1:has-text("Components")');
    this.tableRows = page.locator("tbody tr");
    this.searchInput = page.locator('input[placeholder*="Search"]');
  }

  async goto() {
    await this.page.goto("/components");
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async filter(query: string) {
    await this.searchInput.fill(query);
  }
}
