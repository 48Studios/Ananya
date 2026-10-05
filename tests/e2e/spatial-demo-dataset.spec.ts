import { test, expect, requireE2EAuth } from "../fixtures/test.fixture";
import { Pool } from "pg";
import * as crypto from "crypto";
import {
  DEMO_CODES,
  resolveDemoLocationIds,
} from "./helpers/demo-dataset";

test.beforeEach(() => requireE2EAuth());

const DB_URL =
  process.env.DATABASE_URL ||
  "******localhost:5432/ananya";

/**
 * Browser smoke test over the seeded Spatial Inventory demo dataset.
 *
 * Requires the demo dataset (`pnpm seed:spatial`) and an authenticated browser
 * session. Views the dataset only: it asserts that (a) the mapping states the
 * seed declares are what Location Details, the spatial tree and the 2D/3D
 * canvases report, and (b) viewing never mutates spatial persistence.
 */
test.describe("Spatial Demo Dataset — end-to-end playground", () => {
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

    testToken = "playwright-demo-token-" + crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      "INSERT INTO user_sessions (user_id, token, ip_address, user_agent, device_info, expires_at) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        adminId,
        testToken,
        "127.0.0.1",
        "Playwright Spatial Demo",
        "Headless Chromium",
        expiresAt,
      ],
    );

    ids = await resolveDemoLocationIds(pool, [
      DEMO_CODES.warehouse,
      DEMO_CODES.cabinetA,
      DEMO_CODES.cabinetB,
      DEMO_CODES.cabinetC,
      DEMO_CODES.tray,
      DEMO_CODES.shelf,
      DEMO_CODES.drawerA01,
      DEMO_CODES.drawerC01,
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

  async function sectionOrder(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const text = document.querySelector("main")?.innerText ?? "";
      return {
        summary: text.indexOf("Stored Components"),
        info: text.indexOf("Location Information"),
        components: text.indexOf("Containing Components & Stock"),
        subLocations: text.indexOf("Sub-Locations & Spatial Layout"),
      };
    });
  }

  test("1. Root warehouse: canonical order, root status and published bay plan", async ({
    page,
  }) => {
    await page.goto(`/inventory/locations/${ids[DEMO_CODES.warehouse]}`);
    await expect(page.locator("main h1")).toContainText(
      "Demo Spatial Logistics Warehouse",
      { timeout: 15000 },
    );

    await expect(page.getByText("Facility root", { exact: true })).toBeVisible();
    await expect(page.getByText("Layout published").first()).toBeVisible();

    const order = await sectionOrder(page);
    expect(order.summary).toBeGreaterThanOrEqual(0);
    expect(order.info).toBeGreaterThan(order.summary);
    expect(order.components).toBeGreaterThan(order.info);
    expect(order.subLocations).toBeGreaterThan(order.components);

    // The warehouse must never be counted as an unmapped location.
    await expect(
      page.getByText("Unmapped", { exact: true }),
    ).toHaveCount(0);
  });

  test("2. Primary cabinet: partial mapping, 2D/3D agreement and drawer interaction", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${ids[DEMO_CODES.cabinetA]}?view=spatial3d`,
    );
    await expect(page.locator("div.relative canvas").first()).toBeVisible({
      timeout: 15000,
    });

    const bar = page.locator("[data-testid='spatial-operational-bar']");
    await expect(bar).toContainText("8 in 3D (4 unmapped)");

    await page.getByRole("button", { name: "2D Grid", exact: true }).click();
    await expect(bar).toContainText("8 mapped (4 unmapped)");

    // Drawer opening: mapped drawer compartments are openable.
    await page.getByRole("button", { name: "3D Scene", exact: true }).click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const host = document.querySelector(
              '[data-testid="spatial-3d-interaction-surface"]',
            ) as HTMLElement & {
              __ananyaDrawerProbe?: { getDrawerLocationIds(): string[] };
            };
            return host.__ananyaDrawerProbe?.getDrawerLocationIds().length ?? 0;
          }),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);

    // Selecting a compartment fills the sidebar without mutating persistence.
    const sidebar = page.getByTestId("spatial-inspector-sidebar");
    await expect(sidebar).toHaveAttribute("data-state", "empty");
    await page
      .locator('main button[aria-label^="Storage location"]')
      .first()
      .click();
    await expect(sidebar).toHaveAttribute("data-state", "selected");
  });

  test("3. Mapping states across the dataset: MAPPED, PARTIAL, DRAFT, ARCHIVED, NONE", async ({
    page,
  }) => {
    // Fully mapped cabinet (all six drawers placed).
    await page.goto(`/inventory/locations/${ids[DEMO_CODES.cabinetB]}`);
    await expect(page.locator("main h1")).toContainText("Demo Cabinet B", {
      timeout: 15000,
    });
    await expect(page.getByText("Layout published").first()).toBeVisible();

    // Mapped deep bin.
    await page.goto(`/inventory/locations/${ids[DEMO_CODES.binA0101]}`);
    await expect(page.locator("main h1")).toContainText("Demo Bin A01-01", {
      timeout: 15000,
    });
    await expect(page.getByText("Mapped", { exact: true }).first()).toBeVisible();

    // Unmapped drawer inside the partial cabinet.
    await page.goto(`/inventory/locations/${ids[DEMO_CODES.drawerC01]}`);
    await expect(page.locator("main h1")).toContainText("Demo Drawer C01", {
      timeout: 15000,
    });
    await expect(
      page.getByText("Unmapped", { exact: true }).first(),
    ).toBeVisible();

    // Draft-only cabinet.
    await page.goto(`/inventory/locations/${ids[DEMO_CODES.cabinetC]}`);
    await expect(page.getByText("Layout draft", { exact: true })).toBeVisible();

    // Archived tray.
    await page.goto(`/inventory/locations/${ids[DEMO_CODES.tray]}`);
    await expect(
      page.getByText("Layout archived", { exact: true }),
    ).toBeVisible();

    // No-layout shelf: no container chip, plain unmapped placement.
    await page.goto(`/inventory/locations/${ids[DEMO_CODES.shelf]}`);
    await expect(page.getByText("Layout draft", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("Layout published", { exact: true }),
    ).toHaveCount(0);
  });

  test("4. Viewing the scenes never mutates spatial persistence", async ({
    page,
  }) => {
    const snapshot = async () => {
      const result = await pool.query<{
        nodes: string;
        mappings: string;
        layouts: string;
        revisions: string;
        max_updated_at: string | null;
      }>(
        `SELECT
           (SELECT count(*)::int FROM spatial_nodes n JOIN locations l ON l.id = n.location_id WHERE l.code LIKE 'DEMO-SPATIAL-%') AS nodes,
           (SELECT count(*)::int FROM spatial_layout_mappings m JOIN spatial_layouts sl ON sl.id = m.layout_id WHERE sl.code LIKE 'DEMO-SPATIAL-%') AS mappings,
           (SELECT count(*)::int FROM spatial_layouts WHERE code LIKE 'DEMO-SPATIAL-%') AS layouts,
           (SELECT count(*)::int FROM spatial_layout_revisions r JOIN spatial_layouts sl ON sl.id = r.layout_id WHERE sl.code LIKE 'DEMO-SPATIAL-%') AS revisions,
           (SELECT max(n.updated_at)::text FROM spatial_nodes n JOIN locations l ON l.id = n.location_id WHERE l.code LIKE 'DEMO-SPATIAL-%') AS max_updated_at`,
      );
      return result.rows[0]!;
    };

    const before = await snapshot();

    // Browse the whole playground.
    for (const code of [
      DEMO_CODES.warehouse,
      DEMO_CODES.cabinetA,
      DEMO_CODES.cabinetB,
      DEMO_CODES.cabinetC,
      DEMO_CODES.tray,
      DEMO_CODES.shelf,
    ]) {
      await page.goto(`/inventory/locations/${ids[code]}?view=spatial3d`);
      await expect(page.locator("main h1")).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(400);
    }
    await page.goto(`/inventory/locations/${ids[DEMO_CODES.warehouse]}?view=spatial`);
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toBeVisible({ timeout: 15000 });

    const after = await snapshot();
    expect(after).toEqual(before);
  });
});
