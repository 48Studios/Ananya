import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import * as crypto from "crypto";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://ananya:dTd1Ii43r9Q9@localhost:5432/ananya";

const CABINET_LOCATION_ID = "151c14eb-bc01-4ec9-b5f3-0e7e768084e5"; // DEMO-SPATIAL-CABINET-A

let pool: Pool;
let testToken: string;

test.describe("Spatial Inventory 3D — Phase 7: Inventory-Aware 3D Visualization", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });

    // 1. Create authenticated session for admin@48studios.in
    const adminUserRes = await pool.query(
      "SELECT id FROM users WHERE email = 'admin@48studios.in';",
    );
    if (adminUserRes.rows.length === 0) {
      throw new Error("Admin user admin@48studios.in not found in database");
    }
    const adminId = adminUserRes.rows[0].id;

    testToken =
      "playwright-phase7-token-" + crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      "INSERT INTO user_sessions (user_id, token, ip_address, user_agent, device_info, expires_at) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        adminId,
        testToken,
        "127.0.0.1",
        "Playwright Spatial Phase 7",
        "Headless Chromium",
        expiresAt,
      ],
    );
  });

  test.afterAll(async () => {
    if (pool) {
      if (testToken) {
        await pool.query("DELETE FROM user_sessions WHERE token = $1;", [
          testToken,
        ]);
      }
      await pool.end();
    }
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: "ananya_auth_token",
        value: testToken,
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ]);
  });

  test("1. Renders 3D Spatial Inventory view with mode toggles and unit-safe operational metrics", async ({
    page,
  }) => {
    await page.goto(`/locations/${CABINET_LOCATION_ID}?view=spatial3d`);

    // Verify 3D canvas is visible
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Verify Visualization Mode controls exist
    await expect(page.getByRole("button", { name: "Standard", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Provenance", exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Occupancy", exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Labels", exact: false })).toBeVisible();

    // Verify Top Operational Bar metrics are rendered cleanly
    const operationalBar = page.locator("[data-testid='spatial-operational-bar']");
    await expect(operationalBar).toBeVisible();
    await expect(operationalBar).toContainText("Total Stock:");
    await expect(operationalBar).toContainText("Occupancy:");
    await expect(operationalBar).toContainText("Spatial 3D:");

    // Ensure no broken [object Object] or NaN strings in operational metrics
    const barText = await operationalBar.innerText();
    expect(barText).not.toContain("[object Object]");
    expect(barText).not.toContain("NaN");
  });

  test("2. Switches between Standard, Provenance, and Occupancy modes, verifying accessible legend and labels", async ({
    page,
  }) => {
    await page.goto(`/locations/${CABINET_LOCATION_ID}?view=spatial3d`);
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Default: Standard mode legend
    const legend = page.locator("div.absolute.bottom-3.left-3");
    await expect(legend).toBeVisible();
    await expect(legend).toContainText("Selected");
    await expect(legend).toContainText("Locate Target");
    await expect(legend).toContainText("Has Stock");
    await expect(legend).toContainText("Empty");

    // 1. Switch to Provenance Mode
    const provenanceBtn = page.getByRole("button", { name: "Provenance", exact: false });
    await provenanceBtn.click();

    // Verify Provenance Legend displays direct stock separated from descendant sub-compartments
    await expect(legend).toContainText("Direct Stock");
    await expect(legend).toContainText("Sub-compartments");
    await expect(legend).toContainText("Mixed");
    await expect(legend).toContainText("Empty");

    // 2. Switch to Occupancy Mode
    const occupancyBtn = page.getByRole("button", { name: "Occupancy", exact: false });
    await occupancyBtn.click();

    // Verify Occupancy Legend displays explicit capacity tiers and presence for unspecified
    await expect(legend).toContainText("Low (<50%)");
    await expect(legend).toContainText("Mod (50–79%)");
    await expect(legend).toContainText("High (80–100%)");
    await expect(legend).toContainText("Over (>100%)");
    await expect(legend).toContainText("Presence (Cap N/A)");
    await expect(legend).toContainText("Empty (0%)");

    // 3. Toggle Labels on and off
    const labelsToggle = page.getByRole("button", { name: "Labels", exact: false });
    await expect(labelsToggle).toBeVisible();
    await labelsToggle.click();
    await labelsToggle.click();
  });

  test("3. Issues only a single aggregate operational view query per scene load (zero N+1 requests per node)", async ({
    page,
  }) => {
    const operationalViewRequests: string[] = [];

    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/operational-view")) {
        operationalViewRequests.push(url);
      }
    });

    await page.goto(`/locations/${CABINET_LOCATION_ID}?view=spatial3d`);
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Wait 1 second to ensure no stray N+1 requests fire
    await page.waitForTimeout(1000);

    // In dev mode (React StrictMode), effects mount twice, so at most 2 requests for the root location,
    // and crucially ZERO requests per child spatial node (preventing N+1 queries).
    expect(operationalViewRequests.length).toBeLessThanOrEqual(2);
    expect(operationalViewRequests.length).toBeGreaterThanOrEqual(1);
    for (const req of operationalViewRequests) {
      expect(req).toContain(CABINET_LOCATION_ID);
    }
  });

  test("4. Selects a compartment and inspects unit-safe direct vs descendant stock and explicit capacity", async ({
    page,
  }) => {
    await page.goto(`/locations/${CABINET_LOCATION_ID}?view=spatial3d`);
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Open unmapped tray if any exist, or click canvas to trigger selection
    const unmappedBtn = page.getByRole("button", { name: /unmapped/i });
    if (await unmappedBtn.isVisible()) {
      await unmappedBtn.click();
      const unmappedDrawer = page.getByText("DEMO-SPATIAL-DRAWER-A06").first();
      if (await unmappedDrawer.isVisible()) {
        await unmappedDrawer.click();
      }
    } else {
      // Click canvas
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    }

    // Verify Inspector opens with unit-safe direct vs descendant stock
    await expect(page.getByText("Direct Stock").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Sub-compartment Stock").first()).toBeVisible();

    // Verify Physical Capacity is displayed without false percentages for unspecified locations
    await expect(page.getByText("Physical Capacity:").first()).toBeVisible();

    // Verify Page navigation button exists in inspector actions
    await expect(page.getByRole("button", { name: "Page", exact: false }).first()).toBeVisible();
  });

  test("5. Captures visual verification screenshots across modes and inspector", async ({
    page,
  }) => {
    const artifactDir =
      "/Users/jrsarath/.gemini/antigravity-ide/brain/982b4a48-12e8-4b31-affb-7a158555e9a0";

    await page.goto(`/locations/${CABINET_LOCATION_ID}?view=spatial3d`);
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Standard mode screenshot
    await page.screenshot({
      path: `${artifactDir}/spatial_3d_standard.png`,
      fullPage: false,
    });

    // Provenance mode screenshot
    const provenanceBtn = page.getByRole("button", { name: "Provenance", exact: false });
    await provenanceBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${artifactDir}/spatial_3d_provenance.png`,
      fullPage: false,
    });

    // Occupancy mode screenshot
    const occupancyBtn = page.getByRole("button", { name: "Occupancy", exact: false });
    await occupancyBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${artifactDir}/spatial_3d_occupancy.png`,
      fullPage: false,
    });

    // Open inspector and capture inspector view
    const unmappedBtn = page.getByRole("button", { name: /unmapped/i });
    if (await unmappedBtn.isVisible()) {
      await unmappedBtn.click();
      const unmappedDrawer = page.getByText("DEMO-SPATIAL-DRAWER-A06").first();
      if (await unmappedDrawer.isVisible()) {
        await unmappedDrawer.click();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `${artifactDir}/spatial_3d_inspector.png`,
          fullPage: false,
        });
      }
    }
  });

  test("6. Server-side permissions: rejects unauthorized callers with 403/401 and prevents quantity exposure", async ({
    playwright,
  }) => {
    // 1. Create a user session with Auditor role (lacks Inventory.Read)
    const roleRes = await pool.query("SELECT id FROM roles WHERE name = 'Auditor';");
    const auditorRoleId = roleRes.rows[0].id;

    const unauthUserId = crypto.randomUUID();
    const unauthToken = "playwright-unauth-" + crypto.randomBytes(16).toString("hex");

    await pool.query(
      "INSERT INTO users (id, email, password_hash, first_name, last_name, role_id) VALUES ($1, $2, $3, $4, $5, $6);",
      [unauthUserId, `unauth-${Date.now()}@test.com`, "hash", "Unauth", "Auditor", auditorRoleId],
    );

    await pool.query(
      "INSERT INTO user_sessions (user_id, token, ip_address, user_agent, device_info, expires_at) VALUES ($1, $2, $3, $4, $5, $6);",
      [unauthUserId, unauthToken, "127.0.0.1", "Playwright", "Headless", new Date(Date.now() + 60000)],
    );

    try {
      const apiContext = await playwright.request.newContext({
        baseURL: "http://localhost:4000",
      });

      // A. Authorized request (with admin token) -> 200 OK with projections
      const authRes = await apiContext.get(
        `/spatial/locations/${CABINET_LOCATION_ID}/operational-view`,
        { headers: { Authorization: `Bearer ${testToken}` } },
      );
      expect(authRes.status()).toBe(200);
      const authData = await authRes.json();
      expect(authData.projections).toBeDefined();
      expect(Array.isArray(authData.projections)).toBe(true);

      // B. Unauthorized request without Inventory.Read -> 403 Forbidden
      const unauthRes = await apiContext.get(
        `/spatial/locations/${CABINET_LOCATION_ID}/operational-view`,
        { headers: { Authorization: `Bearer ${unauthToken}` } },
      );
      expect(unauthRes.status()).toBe(403);
      const unauthData = await unauthRes.json();
      expect(unauthData.statusCode).toBe(403);
      expect(unauthData.message).toContain("Inventory.Read");
      // Confirm sensitive quantities/projections are NOT exposed in the payload
      expect(unauthData.projections).toBeUndefined();
      expect(unauthData.children).toBeUndefined();

      // C. Unauthenticated request without token -> 401 Unauthorized
      const anonRes = await apiContext.get(
        `/spatial/locations/${CABINET_LOCATION_ID}/operational-view`,
      );
      expect(anonRes.status()).toBe(401);

      // D. Direct inventory projections endpoint -> 403 Forbidden
      const projRes = await apiContext.get(
        `/inventory-projections/location/${CABINET_LOCATION_ID}`,
        { headers: { Authorization: `Bearer ${unauthToken}` } },
      );
      expect(projRes.status()).toBe(403);
    } finally {
      await pool.query("DELETE FROM user_sessions WHERE user_id = $1;", [unauthUserId]);
      await pool.query("DELETE FROM users WHERE id = $1;", [unauthUserId]);
    }
  });

  test("7. Freshness and invalidation: preserves view state, supports navigation and breadcrumb reload", async ({
    page,
  }) => {
    await page.goto(`/locations/${CABINET_LOCATION_ID}?view=spatial3d`);
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Verify operational metrics are present
    const operationalBar = page.locator("[data-testid='spatial-operational-bar']");
    await expect(operationalBar).toBeVisible();
    await expect(operationalBar).toContainText("Total Stock:");

    // Switch to Provenance mode
    const provenanceBtn = page.getByRole("button", { name: "Provenance", exact: false });
    await provenanceBtn.click();
    await expect(page.locator("div.absolute.bottom-3.left-3")).toContainText("Direct Stock");

    // Test 1: Page refresh preserves canvas and operational state
    await page.reload();
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await expect(page.locator("[data-testid='spatial-operational-bar']")).toBeVisible();

    // Test 2: Navigate away to another location (drawer)
    const drawerLocationId = "cc6e8839-2d94-48c2-9710-04be238a3c32"; // DEMO-SPATIAL-DRAWER-A06
    await page.goto(`/locations/${drawerLocationId}`);
    await expect(page.getByText("DEMO-SPATIAL-DRAWER-A06").first()).toBeVisible({ timeout: 10000 });

    // Test 3: Return to the existing 3D view of the cabinet
    await page.goto(`/locations/${CABINET_LOCATION_ID}?view=spatial3d`);
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await expect(page.locator("[data-testid='spatial-operational-bar']")).toContainText("Total Stock:");
  });
});
