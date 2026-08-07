import { test, expect } from "@playwright/test";

test.describe("Primary Business Workflows E2E Audit", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("1. Finished Goods (/finished-goods)", async ({ page }) => {
    await page.goto("/finished-goods");
    await expect(page.locator("h1")).toContainText("Finished Goods Inventory Master");

    const btn = page.getByRole("button", { name: "Receive Production Batch" });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Receive Production Batch")).toBeVisible();
  });

  test("2. Material Consumption (/material-consumption)", async ({ page }) => {
    await page.goto("/material-consumption");
    await expect(page.locator("h1")).toContainText("Material Consumption & Issue Log");

    const btn = page.getByRole("button", { name: "Issue Material to Work Order" });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Issue Material to Work Order")).toBeVisible();
  });

  test("3. Production Orders (/production-orders)", async ({ page }) => {
    await page.goto("/production-orders");
    await expect(page.locator("h1")).toContainText("Production Orders & Scheduling");

    const btn = page.getByRole("button", { name: "Release New Production Order" });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Create Production Order")).toBeVisible();
  });

  test("4. Operations Tasks (/tasks)", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page.locator("h1")).toContainText("Operations Task Management");

    const btn = page.getByRole("button", { name: "Create Task" });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Create Operational Task")).toBeVisible();
  });

  test("5. Timesheets & Labor Logs (/time)", async ({ page }) => {
    await page.goto("/time");
    await expect(page.locator("h1")).toContainText("Employee Time Tracking & Labor Logs");

    const btn = page.getByRole("button", { name: "Log Hours" });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Log Labor Hours")).toBeVisible();
  });

  test("6. Field Service Tickets (/service)", async ({ page }) => {
    await page.goto("/service");
    await expect(page.locator("h1")).toContainText("Field Service & Technical Support Tickets");

    const btn = page.getByRole("button", { name: "New Service Ticket" });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("New Field Service Ticket")).toBeVisible();
  });

  test("7. Warranty Claims (/warranty)", async ({ page }) => {
    await page.goto("/warranty");
    await expect(page.locator("h1")).toContainText("Warranty & Serial Number Guarantees");

    const btn = page.getByRole("button", { name: "File New Warranty Claim" });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("File New Warranty Claim")).toBeVisible();
  });

  test("8. RMA Returns (/rma)", async ({ page }) => {
    await page.goto("/rma");
    await expect(page.locator("h1")).toContainText("Return Merchandise Authorization (RMA)");

    const btn = page.getByRole("button", { name: "Issue New RMA" });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Issue Return Merchandise Authorization")).toBeVisible();
  });

  test("9. Supplier Returns (/supplier-returns)", async ({ page }) => {
    await page.goto("/supplier-returns");
    await expect(page.locator("h1")).toContainText("Supplier Returns & Debit Memos");

    const btn = page.getByRole("button", { name: "Create Supplier Return" });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Create Supplier Return")).toBeVisible();
  });
});
