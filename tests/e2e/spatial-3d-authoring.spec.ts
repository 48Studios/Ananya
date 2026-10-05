import { test, expect, requireE2EAuth } from "../fixtures/test.fixture";
import { Pool } from "pg";
import crypto from "crypto";
import {
  DEMO_CODES,
  resolveDemoLocationId,
} from "./helpers/demo-dataset";
test.beforeEach(() => requireE2EAuth());

const DB_CONN =
  process.env.DATABASE_URL ||
  "postgresql://ananya:dTd1Ii43r9Q9@localhost:5432/ananya";
const ADMIN_USER_ID = "e941c06c-f461-4cac-88ed-d2197617d06b"; // admin@48studios.in

// Resolved from the seeded code: a re-seed generates a new server-side UUID.
let CABINET_LOCATION_ID: string;

test.describe.configure({ mode: "serial" });

test.describe("Spatial Inventory 3D — Visual Anchor Authoring Runtime", () => {
  let pool: Pool;
  let sessionToken: string;

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: DB_CONN });

    // Provision test authentication session
    sessionToken = `test-auth-token-${crypto.randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      "INSERT INTO user_sessions (user_id, token, ip_address, user_agent, device_info, expires_at) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        ADMIN_USER_ID,
        sessionToken,
        "127.0.0.1",
        "playwright-authoring-test",
        "Headless Chromium",
        expiresAt,
      ],
    );

    CABINET_LOCATION_ID = await resolveDemoLocationId(
      pool,
      DEMO_CODES.cabinetA,
    );
  });

  test.afterAll(async () => {
    if (pool) {
      await pool.query(
        "DELETE FROM user_sessions WHERE user_agent = 'playwright-authoring-test';",
      );
      await pool.end();
    }
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: "ananya_auth_token",
        value: sessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ]);
  });

  test("1. Edit Anchors toggle opens authoring workspace with 3D markers and panel", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
      {
        waitUntil: "networkidle",
      },
    );

    // Check Edit Anchors button is available
    const editAnchorsBtn = page.getByRole("button", { name: /Edit Anchors/i });
    await expect(editAnchorsBtn).toBeVisible({ timeout: 10000 });

    // Click Edit Anchors
    await editAnchorsBtn.click();

    // Verify 3D canvas overlay indicates authoring mode active
    await expect(page.getByText("Anchor Authoring Active")).toBeVisible();

    // Verify Anchor Authoring sidebar panel opens
    await expect(
      page.getByRole("heading", { name: "ANCHOR AUTHORING" }),
    ).toBeVisible();

    // Verify Move and Rotate gizmo toggles are visible
    await expect(
      page.getByRole("button", { name: "Move" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Rotate" }).first(),
    ).toBeVisible();

    // Verify exit authoring works
    const exitBtn = page.getByRole("button", { name: "Exit Edit" });
    await expect(exitBtn).toBeVisible();
    await exitBtn.click();

    // Verify returns to standard inspection mode
    await expect(
      page.getByRole("button", { name: "Edit Anchors" }),
    ).toBeVisible();
  });

  test("2. Select anchor, inspect coordinates, verify live preview and occupancy", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
      {
        waitUntil: "networkidle",
      },
    );

    await page.getByRole("button", { name: /Edit Anchors/i }).click();

    // Select Anchor A01 from dropdown
    const selectDropdown = page.locator("select").first();
    await expect(selectDropdown).toBeVisible();
    await selectDropdown.selectOption({ index: 1 });

    // Check anchor code and coordinates inputs
    const codeInput = page.getByPlaceholder("e.g. A01");
    await expect(codeInput).toHaveValue("A01");

    // Occupancy banner should show mapped child compartment
    await expect(page.getByText(/Mapped to:/i)).toBeVisible();
    await expect(page.getByText("Live Preview Active")).toBeVisible();

    // Position coordinates should display 100, 675, 0 mm
    const posX = page.locator('input[type="number"]').first();
    await expect(posX).toHaveValue("100");
  });

  test("3. Edit coordinates, verify dirty diff state, and guard cancel via ConfirmDialog", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
      {
        waitUntil: "networkidle",
      },
    );

    await page.getByRole("button", { name: /Edit Anchors/i }).click();

    // Select Anchor A01
    const selectDropdown = page.locator("select").first();
    await selectDropdown.selectOption({ index: 1 });

    // Modify Position X from 100 to 120 mm
    const posX = page.locator('input[type="number"]').first();
    await posX.fill("120");

    // Unsaved dirty summary should appear
    await expect(
      page.getByText(/Unsaved: 0 added, 1 edited, 0 removed/i),
    ).toBeVisible();

    // Save button should be enabled
    const saveBtn = page.getByRole("button", { name: /Save Anchors/i });
    await expect(saveBtn).toBeEnabled();

    // Click Cancel to trigger discard guard
    const cancelBtn = page.getByRole("button", { name: "Cancel" });
    await cancelBtn.click();

    // Confirm dialog should appear
    await expect(
      page.getByText("Discard Unsaved Anchor Changes?"),
    ).toBeVisible();

    // Click Discard Changes
    await page.getByRole("button", { name: "Discard Changes" }).click();

    // Should return to normal view with changes discarded
    await expect(
      page.getByRole("button", { name: "Edit Anchors" }),
    ).toBeVisible();
  });

  test("4. Add new anchor and detect envelope boundary warnings", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
      {
        waitUntil: "networkidle",
      },
    );

    await page.getByRole("button", { name: /Edit Anchors/i }).click();

    // Click + New Anchor
    await page.getByRole("button", { name: "New Anchor" }).click();

    // Verify unsaved dirty summary updates
    await expect(page.getByText(/Unsaved: 1 added/i)).toBeVisible();

    // Position Y is the 2nd number input (X, Y, Z)
    const numInputs = page.locator('input[type="number"]');
    const posY = numInputs.nth(1);

    // Set Y to 1200mm (exceeds 900mm cabinet height)
    await posY.fill("1200");

    // Boundary warning banner should appear
    await expect(
      page.getByText(/Anchor extends outside model height/i),
    ).toBeVisible();

    // Cleanly cancel
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Discard Changes" }).click();
  });

  test("5. Atomic multi-anchor bulk save persists to database and survives reload", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
      {
        waitUntil: "networkidle",
      },
    );

    await page.getByRole("button", { name: /Edit Anchors/i }).click();

    // Select Anchor A01
    const selectDropdown = page.locator("select").first();
    await selectDropdown.selectOption({ index: 1 });

    const posX = page.locator('input[type="number"]').first();
    await expect(posX).toHaveValue("100");

    // Edit X coordinate to 105 mm
    await posX.fill("105");
    await expect(
      page.getByText(/Unsaved: 0 added, 1 edited, 0 removed/i),
    ).toBeVisible();

    // Save and wait for bulk-save API call to succeed
    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes("/anchors/bulk-save") && resp.ok(),
      ),
      page.getByRole("button", { name: /Save Anchors/i }).click(),
    ]);

    // Viewport returns to standard inspection mode
    await expect(
      page.getByRole("button", { name: "Edit Anchors" }),
    ).toBeVisible();

    // Reload page to verify persisted state from database
    await page.reload({ waitUntil: "networkidle" });

    // Open authoring mode again and verify coordinate is 105 mm
    await page.getByRole("button", { name: /Edit Anchors/i }).click();
    const selectDropdownReloaded = page.locator("select").first();
    await selectDropdownReloaded.selectOption({ index: 1 });
    const posXReloaded = page.locator('input[type="number"]').first();
    await expect(posXReloaded).toHaveValue("105");

    // Clean up: restore original coordinate 100 mm and save
    await posXReloaded.fill("100");
    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes("/anchors/bulk-save") && resp.ok(),
      ),
      page.getByRole("button", { name: /Save Anchors/i }).click(),
    ]);
    await expect(
      page.getByRole("button", { name: "Edit Anchors" }),
    ).toBeVisible();
  });

  test("6. Concurrent conflict error preserves user draft and shows conflict message", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
      {
        waitUntil: "networkidle",
      },
    );

    await page.getByRole("button", { name: /Edit Anchors/i }).click();

    // Select Anchor A01
    const selectDropdown = page.locator("select").first();
    await selectDropdown.selectOption({ index: 1 });

    const posX = page.locator('input[type="number"]').first();
    await posX.fill("135");

    // Mock 409 Conflict from bulk-save endpoint
    await page.route(
      "**/spatial/models/**/anchors/bulk-save",
      async (route) => {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 409,
            error: "Conflict",
            message:
              "Spatial model was modified by another user. Please reload the page to get the latest version.",
          }),
        });
      },
    );

    // Click Save Anchors
    await page.getByRole("button", { name: /Save Anchors/i }).click();

    // Verify conflict error banner appears
    await expect(
      page.getByText(
        /This model or its anchors have been modified by another operation/i,
      ),
    ).toBeVisible();

    // Verify authoring panel is STILL open and draft values are PRESERVED
    await expect(
      page.getByRole("heading", { name: "ANCHOR AUTHORING" }),
    ).toBeVisible();
    await expect(posX).toHaveValue("135");
    await expect(
      page.getByRole("button", { name: /Save Anchors/i }),
    ).toBeEnabled();

    // Unroute and cancel cleanly
    await page.unroute("**/spatial/models/**/anchors/bulk-save");
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Discard Changes" }).click();
  });

  test("7. Read-only user without Inventory.Update cannot access anchor authoring", async ({
    page,
  }) => {
    // Intercept auth/me to strip Inventory.Update permission
    await page.route("**/auth/me", async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      await route.fulfill({
        response,
        json: {
          ...json,
          permissions: ["Inventory.Read", "Location.Read"],
        },
      });
    });

    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
      {
        waitUntil: "networkidle",
      },
    );

    // Verify Edit Anchors button is disabled with permission tooltip
    const editBtn = page.getByRole("button", { name: /Edit Anchors/i });
    await expect(editBtn).toBeVisible();
    await expect(editBtn).toBeDisabled();
    await expect(editBtn).toHaveAttribute(
      "title",
      "You need the Inventory.Update permission to edit spatial anchors",
    );

    // Verify authoring workspace is not accessible
    await expect(page.getByText("Anchor Authoring Active")).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "ANCHOR AUTHORING" }),
    ).not.toBeVisible();
  });
});
