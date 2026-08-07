import { test, expect } from "../../fixtures/test.fixture";

test.describe("Import / Export Framework & Read Model Data Integrity", () => {
  test("should render import trigger and open unified ImportWizard with FileUploader on Components", async ({
    page,
  }) => {
    await page.goto("/components");
    const importBtn = page.locator('button:has-text("Import")');
    await expect(importBtn).toBeVisible();
    await importBtn.click();

    // Verify ImportWizard modal opens
    const wizardModal = page.locator("text=Import Component Wizard");
    await expect(wizardModal).toBeVisible();

    // Verify unified FileUploader component is rendered
    await expect(
      page.locator("text=Upload Component CSV, XLSX, or JSON file"),
    ).toBeVisible();
    await expect(page.locator('button:has-text("Browse File")')).toBeVisible();
  });

  test("should import Categories via multipart file upload and verify immediate UI read-model visibility and persistence", async ({
    page,
  }) => {
    await page.goto("/categories");
    await page.locator('button:has-text("Import")').click();

    const mockCategoryCsv =
      "Category Code,Category Name,Description\nCAT-E2E-100,E2E Active Components,High frequency power electronics";

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "categories_import_e2e.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(mockCategoryCsv),
    });

    // Step 2: Column Mapping
    await expect(page.locator("text=Column Mapping")).toBeVisible({
      timeout: 5000,
    });
    await page.locator('button:has-text("Validate & Next")').click();

    // Step 3: Validation
    await expect(
      page.locator("text=Pre-Import Validation Check"),
    ).toBeVisible();
    await page.locator('button:has-text("Confirm & Import")').click();

    // Step 5: Completion Report
    await expect(
      page.locator("text=Import Completed Successfully"),
    ).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("Done")').click();

    // Immediate Read Model Verification in UI
    await expect(page.locator("text=CAT-E2E-100")).toBeVisible({
      timeout: 5000,
    });

    // Browser Reload Verification
    await page.reload();
    await expect(page.locator("text=CAT-E2E-100")).toBeVisible();
  });

  test("should import Components via multipart file upload and verify immediate UI visibility", async ({
    page,
  }) => {
    await page.goto("/components");
    await page.locator('button:has-text("Import")').click();

    const mockComponentCsv =
      "SKU,Name,Description,Unit\nCOMP-E2E-200,E2E Power Resistor 100K,Precision film resistor,pcs";

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "components_import_e2e.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(mockComponentCsv),
    });

    await expect(page.locator("text=Column Mapping")).toBeVisible({
      timeout: 5000,
    });
    await page.locator('button:has-text("Validate & Next")').click();
    await expect(
      page.locator("text=Pre-Import Validation Check"),
    ).toBeVisible();
    await page.locator('button:has-text("Confirm & Import")').click();
    await expect(
      page.locator("text=Import Completed Successfully"),
    ).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("Done")').click();

    // Immediate UI Read Model Visibility Verification
    await expect(page.locator("text=comp-e2e-200")).toBeVisible({
      timeout: 5000,
    });
  });

  test("should import Suppliers via multipart file upload and verify immediate UI visibility", async ({
    page,
  }) => {
    await page.goto("/suppliers");
    await page.locator('button:has-text("Import")').click();

    const mockSupplierCsv =
      "Code,Name,Payment Terms,Currency\nSUP-E2E-300,E2E Electronics Vendor,NET30,INR";

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "suppliers_import_e2e.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(mockSupplierCsv),
    });

    await expect(page.locator("text=Column Mapping")).toBeVisible({
      timeout: 5000,
    });
    await page.locator('button:has-text("Validate & Next")').click();
    await expect(
      page.locator("text=Pre-Import Validation Check"),
    ).toBeVisible();
    await page.locator('button:has-text("Confirm & Import")').click();
    await expect(
      page.locator("text=Import Completed Successfully"),
    ).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("Done")').click();

    await expect(page.locator("text=SUP-E2E-300")).toBeVisible({
      timeout: 5000,
    });
  });

  test("should display validation errors for CSV missing required columns", async ({
    page,
  }) => {
    await page.goto("/components");
    await page.locator('button:has-text("Import")').click();

    const invalidCsvContent = "Description,Unit\nTest Description,pcs";

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "invalid_components.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(invalidCsvContent),
    });

    await expect(page.locator("text=Column Mapping")).toBeVisible({
      timeout: 5000,
    });
    await page.locator('button:has-text("Validate & Next")').click();
    await expect(
      page.locator("text=Pre-Import Validation Check"),
    ).toBeVisible();
  });
});
