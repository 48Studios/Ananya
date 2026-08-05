import { test, expect } from "@playwright/test";

test.describe("Authentication & Organization Onboarding Suite", () => {
  test("onboarding landing page displays 3 clear onboarding choices without requiring an invitation token", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await expect(page.getByText("Create New Organization")).toBeVisible();
    await expect(page.getByText("Join Existing Organization")).toBeVisible();
    await expect(page.getByText("Sign In")).toBeVisible();
  });

  test("creating a new organization does not require an invitation token and launches dashboard", async ({
    page,
  }) => {
    await page.goto("/onboarding/create");

    // Step 1: Root Owner Account
    await page.fill('input[placeholder="Jane"]', "OwnerFirst");
    await page.fill('input[placeholder="Smith"]', "OwnerLast");
    await page.fill(
      'input[placeholder="owner@company.com"]',
      `owner-${Date.now()}@acme.internal`,
    );
    await page.fill('input[placeholder="••••••••••••"]', "OwnerPass123!");
    await page.click('button:has-text("Next: Organization Details")');

    // Step 2: Organization Details
    await page.fill(
      'input[placeholder="e.g. Apex Hardware Technologies"]',
      "Apex Hardware Ltd",
    );
    await page.click('button:has-text("Create Organization & Launch")');

    // Should authenticate directly and enter ERP dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("joining existing organization displays token verification", async ({
    page,
  }) => {
    await page.goto("/onboarding/join");
    await expect(
      page.getByPlaceholder("Paste invitation token here"),
    ).toBeVisible();
  });

  test("invalid invitation token shows clear error message", async ({
    page,
  }) => {
    await page.goto("/onboarding/join");
    await page.fill(
      'input[placeholder="Paste invitation token here"]',
      "invalid-token-123",
    );
    await page.click('button:has-text("Verify Invitation Token")');
    await expect(
      page.getByText("Invalid, revoked, or expired invitation token."),
    ).toBeVisible();
  });
});
