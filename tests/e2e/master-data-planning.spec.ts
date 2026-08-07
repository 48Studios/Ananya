import { test, expect } from "@playwright/test";

test.describe("Master Data & Planning Modules Completion Audit", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to homepage or base URL
    await page.goto("/");
  });

  test("1. Warehouse Bins & Storage Locations (/warehouse-bins)", async ({
    page,
  }) => {
    await page.goto("/warehouse-bins");
    await expect(page.locator("h1")).toContainText(
      "Warehouse Bins & Storage Locations",
    );

    // Verify StatCards are present and render values
    await expect(page.getByText("Total Bins")).toBeVisible();
    await expect(page.getByText("Available Active Bins")).toBeVisible();

    // Verify Create Bin button opens dialog
    const createBtn = page.getByRole("button", { name: "Create Bin Location" });
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Create Location Node")).toBeVisible();
  });

  test("2. Warehouse Policies & Picking Rules (/warehouse-policies)", async ({
    page,
  }) => {
    await page.goto("/warehouse-policies");
    await expect(page.locator("h1")).toContainText(
      "Warehouse Policies & Picking Rules",
    );

    await expect(page.getByText("Active Storage Policies")).toBeVisible();

    const createBtn = page.getByRole("button", { name: "New Storage Policy" });
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("3. Physical Stock Counts (/stock-counts)", async ({ page }) => {
    await page.goto("/stock-counts");
    await expect(page.locator("h1")).toContainText(
      "Stock Audits & Cycle Counting",
    );

    await expect(page.getByText("Total Audit Runs")).toBeVisible();

    const createBtn = page.getByRole("button", { name: "New Stock Audit Run" });
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("4. Batch & Lot Management (/batches)", async ({ page }) => {
    await page.goto("/batches");
    await expect(page.locator("h1")).toContainText("Batch & Lot Management");

    await expect(page.getByText("Total Registered Batches")).toBeVisible();

    const createBtn = page.getByRole("button", { name: "Create Lot Batch" });
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("5. Serial Numbers (/serials)", async ({ page }) => {
    await page.goto("/serials");
    await expect(page.locator("h1")).toContainText(
      "Serial Number Master Index",
    );

    await expect(page.getByText("Total Serials Registered")).toBeVisible();

    const createBtn = page.getByRole("button", {
      name: "Register Serial Number",
    });
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("6. Demand Projection (/projections)", async ({ page }) => {
    await page.goto("/projections");
    await expect(page.locator("h1")).toContainText(
      "Financial Projections & Cash Flow Forecast",
    );
    await expect(
      page.getByText("Projected Cumulative Net Inflow"),
    ).toBeVisible();
  });

  test("7. Purchase Invoices & AP Bills (/purchase-invoices)", async ({
    page,
  }) => {
    await page.goto("/purchase-invoices");
    await expect(page.locator("h1")).toContainText(
      "Purchase Invoices & AP Bills",
    );

    await expect(page.getByText("Total Invoices")).toBeVisible();

    const createBtn = page.getByRole("button", {
      name: "Enter Vendor Invoice",
    });
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("8. Material Requirements Planning Engine (/mrp & subpages)", async ({
    page,
  }) => {
    await page.goto("/mrp");
    await expect(page.locator("h1")).toContainText(
      "Material Requirements Planning (MRP) Hub",
    );

    const runBtn = page.getByRole("button", {
      name: "Run MRP Calculation Engine",
    });
    await expect(runBtn).toBeVisible();

    await page.goto("/mrp/materials");
    await expect(page.locator("h1")).toContainText(
      "MRP Material Shortage Matrix",
    );

    await page.goto("/mrp/runs");
    await expect(page.locator("h1")).toContainText(
      "MRP Execution History & Logs",
    );

    await page.goto("/mrp/capacity");
    await expect(page.locator("h1")).toContainText(
      "MRP Work Center Capacity Loading",
    );

    await page.goto("/mrp/production");
    await expect(page.locator("h1")).toContainText(
      "MRP Planned Production Orders",
    );

    await page.goto("/mrp/purchases");
    await expect(page.locator("h1")).toContainText(
      "MRP Planned Purchase Orders",
    );
  });
});
