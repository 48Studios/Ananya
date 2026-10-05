import { test, expect, requireE2EAuth } from "../fixtures/test.fixture";
import { Pool } from "pg";
import * as crypto from "crypto";
import { DEMO_CODES, resolveDemoLocationIds } from "./helpers/demo-dataset";

test.beforeEach(() => requireE2EAuth());

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://ananya:ananya@localhost:5432/ananya";

/**
 * Regression suite for "Spatial View opens the parent instead of the selected
 * location".
 *
 * The requested location is authoritative: a location that can render a frame
 * of its own (Drawer, Cabinet, Warehouse) must render that frame, and a leaf
 * that is only placed inside an ancestor's frame (Bin) must render that
 * ancestor's frame while remaining the selected location in the URL, the
 * sidebar, and both 2D and 3D.
 */
test.describe("Spatial View — requested location stays authoritative", () => {
  test.describe.configure({ mode: "serial" });

  let pool: Pool;
  let testToken: string;
  let ids: Record<string, string>;

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });

    const adminUserRes = await pool.query(
      "SELECT id FROM users WHERE email = 'admin@48studios.in';",
    );
    if (adminUserRes.rows.length === 0) {
      throw new Error("Admin user admin@48studios.in not found in database");
    }
    const adminId = adminUserRes.rows[0].id;

    testToken =
      "playwright-spatial-requested-" + crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      "INSERT INTO user_sessions (user_id, token, ip_address, user_agent, device_info, expires_at) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        adminId,
        testToken,
        "127.0.0.1",
        "Playwright Spatial Requested Location",
        "Headless Chromium",
        expiresAt,
      ],
    );

    ids = await resolveDemoLocationIds(pool, [
      DEMO_CODES.warehouse,
      DEMO_CODES.cabinetA,
      DEMO_CODES.drawerA01,
      DEMO_CODES.binA0101,
    ]);
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

  test("Test 1 — Drawer renders its own frame, never Cabinet's", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${ids[DEMO_CODES.drawerA01]}?view=spatial`,
    );

    await expect(page.locator("main h1")).toContainText("Demo Drawer A01", {
      timeout: 15000,
    });
    await expect(
      page.getByText(/DEMO-SPATIAL-DRAWER-A01\s+OPERATIONAL LAYOUT/i),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText(/DEMO-SPATIAL-CABINET-A\s+OPERATIONAL LAYOUT/i),
    ).toHaveCount(0);
    // The drawer's own frame contains its two bins.
    await expect(page.getByText("DEMO-SPATIAL-BIN-A01-01").first()).toBeVisible();
  });

  test("Test 2 — Bin renders Drawer's frame with the Bin selected and in the sidebar", async ({
    page,
  }) => {
    const binId = ids[DEMO_CODES.binA0101];
    await page.goto(`/inventory/locations/${binId}?view=spatial`);

    await expect(page.locator("main h1")).toContainText("Demo Bin A01-01", {
      timeout: 15000,
    });
    // Ancestor frame is the rendering context...
    await expect(
      page.getByText(/DEMO-SPATIAL-DRAWER-A01\s+OPERATIONAL LAYOUT/i),
    ).toBeVisible({ timeout: 15000 });
    // ...but the requested bin is the selected location and the sidebar subject.
    await expect(
      page.getByText("DEMO-SPATIAL-BIN-A01-01 selected"),
    ).toBeVisible();
    await expect(page.getByTestId("spatial-inspector-sidebar")).toHaveAttribute(
      "data-state",
      "selected",
    );
    await expect(
      page.getByTestId("spatial-inspector-sidebar").getByText("Demo Bin A01-01"),
    ).toBeVisible();
    expect(page.url()).toContain(binId);
  });

  test("Test 3 — Cabinet does not resolve to Warehouse", async ({ page }) => {
    await page.goto(
      `/inventory/locations/${ids[DEMO_CODES.cabinetA]}?view=spatial`,
    );

    await expect(
      page.getByText(/DEMO-SPATIAL-CABINET-A\s+OPERATIONAL LAYOUT/i),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText(/DEMO-SPATIAL-WAREHOUSE\s+OPERATIONAL LAYOUT/i),
    ).toHaveCount(0);
  });

  test("Test 4 — Warehouse remains the requested and rendering context", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${ids[DEMO_CODES.warehouse]}?view=spatial`,
    );

    await expect(page.locator("main h1")).toContainText(
      "Demo Spatial Logistics Warehouse",
      { timeout: 15000 },
    );
    await expect(
      page.getByText(/DEMO-SPATIAL-WAREHOUSE\s+OPERATIONAL LAYOUT/i),
    ).toBeVisible();
  });

  test("Test 5/6 — Refresh and direct URL keep the Bin requested and selected", async ({
    page,
  }) => {
    const binId = ids[DEMO_CODES.binA0101];
    await page.goto(`/inventory/locations/${binId}?view=spatial`);
    await expect(
      page.getByTestId("spatial-inspector-sidebar").getByText("Demo Bin A01-01"),
    ).toBeVisible({ timeout: 15000 });

    await page.reload();

    await expect(page.locator("main h1")).toContainText("Demo Bin A01-01", {
      timeout: 15000,
    });
    await expect(
      page.getByText("DEMO-SPATIAL-BIN-A01-01 selected"),
    ).toBeVisible();
    await expect(
      page.getByTestId("spatial-inspector-sidebar").getByText("Demo Bin A01-01"),
    ).toBeVisible();
    expect(page.url()).toContain(binId);
  });

  test("Test 7 — 2D/3D switches keep the Bin selected", async ({ page }) => {
    await page.goto(
      `/inventory/locations/${ids[DEMO_CODES.binA0101]}?view=spatial`,
    );
    await expect(
      page.getByTestId("spatial-inspector-sidebar").getByText("Demo Bin A01-01"),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "3D Scene" }).click();
    await expect(
      page.getByText(/DEMO-SPATIAL-DRAWER-A01\s+3D DIGITAL TWIN/i),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByTestId("spatial-inspector-sidebar").getByText("Demo Bin A01-01"),
    ).toBeVisible();

    await page.getByRole("button", { name: "2D Grid" }).click();
    await expect(
      page.getByText(/DEMO-SPATIAL-DRAWER-A01\s+OPERATIONAL LAYOUT/i),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByTestId("spatial-inspector-sidebar").getByText("Demo Bin A01-01"),
    ).toBeVisible();
  });

  test("Locate — Open Spatial View keeps the requested location as the route", async ({
    page,
  }) => {
    const drawerId = ids[DEMO_CODES.drawerA01];
    await page.goto(
      `/inventory/locations/spatial?location=${drawerId}`,
    );

    const openSpatial = page.getByRole("link", { name: /Open Spatial View/ });
    await expect(openSpatial).toHaveAttribute(
      "href",
      new RegExp(`/locations/${drawerId}\\?view=spatial&focusLocation=${drawerId}$`),
    );

    await openSpatial.click();
    await expect(page.locator("main h1")).toContainText("Demo Drawer A01", {
      timeout: 15000,
    });
    await expect(
      page.getByText(/DEMO-SPATIAL-DRAWER-A01\s+OPERATIONAL LAYOUT/i),
    ).toBeVisible({ timeout: 15000 });
    expect(page.url()).toContain(drawerId);
  });
});
