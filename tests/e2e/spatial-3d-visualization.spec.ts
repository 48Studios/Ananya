import { test, expect, requireE2EAuth } from "../fixtures/test.fixture";
import type { Locator, Page } from "@playwright/test";
import { Pool } from "pg";
import * as crypto from "crypto";
import {
  DEMO_CODES,
  resolveDemoLocationIds,
} from "./helpers/demo-dataset";
test.beforeEach(() => requireE2EAuth());

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://ananya:dTd1Ii43r9Q9@localhost:5432/ananya";

// Demo ids are resolved from the seeded codes: the seed utility is
// deterministic by code, and a re-seed generates new server-side UUIDs.
let CABINET_LOCATION_ID: string;
let CABINET_B_LOCATION_ID: string;
let DEMO_WAREHOUSE_ID: string;
let DEMO_RACK_ID: string;
let MAPPED_BIN_ID: string;
let UNMAPPED_DRAWER_ID: string;

let pool: Pool;
let testToken: string;

/** Asserts the inspector stays unmounted for a moment (no delayed reopen). */
async function expectStaysClosed(
  page: Page,
  panel: Locator,
): Promise<void> {
  await expect(panel).toHaveCount(0);
  await page.waitForTimeout(600);
  await expect(panel).toHaveCount(0);
}

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

    // 2. Resolve the seeded demo dataset by code
    const demoIds = await resolveDemoLocationIds(pool, [
      DEMO_CODES.cabinetA,
      DEMO_CODES.cabinetB,
      DEMO_CODES.warehouse,
      DEMO_CODES.rack,
      DEMO_CODES.binA0101,
      DEMO_CODES.drawerC01,
    ]);
    CABINET_LOCATION_ID = demoIds[DEMO_CODES.cabinetA];
    DEMO_WAREHOUSE_ID = demoIds[DEMO_CODES.warehouse];
    DEMO_RACK_ID = demoIds[DEMO_CODES.rack];
    CABINET_B_LOCATION_ID = demoIds[DEMO_CODES.cabinetB];
    MAPPED_BIN_ID = demoIds[DEMO_CODES.binA0101];
    UNMAPPED_DRAWER_ID = demoIds[DEMO_CODES.drawerC01];
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
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
    );

    // Verify 3D canvas is visible
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Verify Visualization Mode controls exist
    await expect(
      page.getByRole("button", { name: "Standard", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Provenance", exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Occupancy", exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Labels", exact: false }),
    ).toBeVisible();

    // Verify Top Operational Bar metrics are rendered cleanly
    const operationalBar = page.locator(
      "[data-testid='spatial-operational-bar']",
    );
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
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
    );
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Default: Standard mode legend (collapsed until opened to keep the
    // canvas free of permanent legend noise).
    const legend = page.locator("div.absolute.bottom-3.left-3");
    await expect(legend).toBeVisible();
    await legend.getByRole("button", { name: /Open 3D scene legend/i }).click();
    await expect(legend).toContainText("Selected");
    await expect(legend).toContainText("Locate Target");
    await expect(legend).toContainText("Has Stock");
    await expect(legend).toContainText("Empty");

    // 1. Switch to Provenance Mode
    const provenanceBtn = page.getByRole("button", {
      name: "Provenance",
      exact: false,
    });
    await provenanceBtn.click();

    // Verify Provenance Legend displays direct stock separated from descendant sub-compartments
    await expect(legend).toContainText("Direct Stock");
    await expect(legend).toContainText("Sub-compartments");
    await expect(legend).toContainText("Mixed");
    await expect(legend).toContainText("Empty");

    // 2. Switch to Occupancy Mode
    const occupancyBtn = page.getByRole("button", {
      name: "Occupancy",
      exact: false,
    });
    await occupancyBtn.click();

    // Verify Occupancy Legend displays explicit capacity tiers and presence for unspecified
    await expect(legend).toContainText("Low (<50%)");
    await expect(legend).toContainText("Mod (50–79%)");
    await expect(legend).toContainText("High (80–100%)");
    await expect(legend).toContainText("Over (>100%)");
    await expect(legend).toContainText("Presence (Cap N/A)");
    await expect(legend).toContainText("Empty (0%)");

    // 3. Toggle Labels on and off
    const labelsToggle = page.getByRole("button", {
      name: "Labels",
      exact: false,
    });
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

    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
    );
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
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
    );
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Open unmapped tray if any exist, or click canvas to trigger selection
    const unmappedBtn = page.getByRole("button", { name: /unmapped/i });
    if (await unmappedBtn.isVisible()) {
      await unmappedBtn.click();
      const unmappedDrawer = page.getByText("DEMO-SPATIAL-DRAWER-C01").first();
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
    await expect(page.getByText("Direct Stock").first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Sub-compartment Stock").first()).toBeVisible();

    // Verify Physical Capacity is displayed without false percentages for unspecified locations
    await expect(page.getByText("Physical Capacity:").first()).toBeVisible();

    // Verify Page navigation button exists in inspector actions
    await expect(
      page.getByRole("button", { name: "Page", exact: false }).first(),
    ).toBeVisible();
  });

  test("5. Captures visual verification screenshots across modes and inspector", async ({
    page,
  }) => {
    const artifactDir =
      "/Users/jrsarath/.gemini/antigravity-ide/brain/982b4a48-12e8-4b31-affb-7a158555e9a0";

    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
    );
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Standard mode screenshot
    await page.screenshot({
      path: `${artifactDir}/spatial_3d_standard.png`,
      fullPage: false,
    });

    // Provenance mode screenshot
    const provenanceBtn = page.getByRole("button", {
      name: "Provenance",
      exact: false,
    });
    await provenanceBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${artifactDir}/spatial_3d_provenance.png`,
      fullPage: false,
    });

    // Occupancy mode screenshot
    const occupancyBtn = page.getByRole("button", {
      name: "Occupancy",
      exact: false,
    });
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
      const unmappedDrawer = page.getByText("DEMO-SPATIAL-DRAWER-C01").first();
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
    const roleRes = await pool.query(
      "SELECT id FROM roles WHERE name = 'Auditor';",
    );
    const auditorRoleId = roleRes.rows[0].id;

    const unauthUserId = crypto.randomUUID();
    const unauthToken =
      "playwright-unauth-" + crypto.randomBytes(16).toString("hex");

    await pool.query(
      "INSERT INTO users (id, email, password_hash, first_name, last_name, role_id) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        unauthUserId,
        `unauth-${Date.now()}@test.com`,
        "hash",
        "Unauth",
        "Auditor",
        auditorRoleId,
      ],
    );

    await pool.query(
      "INSERT INTO user_sessions (user_id, token, ip_address, user_agent, device_info, expires_at) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        unauthUserId,
        unauthToken,
        "127.0.0.1",
        "Playwright",
        "Headless",
        new Date(Date.now() + 60000),
      ],
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
      await pool.query("DELETE FROM user_sessions WHERE user_id = $1;", [
        unauthUserId,
      ]);
      await pool.query("DELETE FROM users WHERE id = $1;", [unauthUserId]);
    }
  });

  test("7. Freshness and invalidation: preserves view state, supports navigation and breadcrumb reload", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
    );
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Verify operational metrics are present
    const operationalBar = page.locator(
      "[data-testid='spatial-operational-bar']",
    );
    await expect(operationalBar).toBeVisible();
    await expect(operationalBar).toContainText("Total Stock:");

    // Switch to Provenance mode and open the collapsible legend
    const provenanceBtn = page.getByRole("button", {
      name: "Provenance",
      exact: false,
    });
    await provenanceBtn.click();
    const legend = page.locator("div.absolute.bottom-3.left-3");
    await legend.getByRole("button", { name: /Open 3D scene legend/i }).click();
    await expect(legend).toContainText("Direct Stock");

    // Test 1: Page refresh preserves canvas and operational state
    await page.reload();
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toBeVisible();

    // Test 2: Navigate away to another location (drawer)
    const drawerLocationId = UNMAPPED_DRAWER_ID; // DEMO-SPATIAL-DRAWER-C01
    await page.goto(`/inventory/locations/${drawerLocationId}`);
    await expect(page.getByText("DEMO-SPATIAL-DRAWER-C01").first()).toBeVisible(
      { timeout: 10000 },
    );

    // Test 3: Return to the existing 3D view of the cabinet
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
    );
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toContainText("Total Stock:");
  });

  test("8. Canvas toolbar identifies the active view and visualization mode", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
    );
    await expect(page.locator("div.relative canvas").first()).toBeVisible({
      timeout: 10000,
    });

    const twoD = page.getByRole("button", { name: "2D Grid", exact: true });
    const threeD = page.getByRole("button", { name: "3D Scene", exact: true });
    const standard = page.getByRole("button", {
      name: "Standard",
      exact: true,
    });
    const provenance = page.getByRole("button", {
      name: "Provenance",
      exact: true,
    });
    const labels = page.getByRole("button", { name: "Labels", exact: true });

    // The active view is exposed to assistive technology and to styling.
    await expect(threeD).toHaveAttribute("aria-pressed", "true");
    await expect(twoD).toHaveAttribute("aria-pressed", "false");
    await expect(standard).toHaveAttribute("aria-pressed", "true");
    await expect(provenance).toHaveAttribute("aria-pressed", "false");

    // ...and the selected segment is visually distinct from the track it sits on.
    const readStyles = () =>
      page.evaluate(() => {
        const pick = (label: string) => {
          const el = Array.from(document.querySelectorAll("button")).find(
            (b) => (b.textContent || "").trim() === label,
          );
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            h: Math.round(rect.height),
            top: Math.round(rect.top),
            bg: cs.backgroundColor,
            color: cs.color,
          };
        };
        const trackOf = (label: string) => {
          const el = Array.from(document.querySelectorAll("button")).find(
            (b) => (b.textContent || "").trim() === label,
          );
          const track = el?.parentElement;
          if (!track) return null;
          const rect = track.getBoundingClientRect();
          return {
            h: Math.round(rect.height),
            top: Math.round(rect.top),
            bg: getComputedStyle(track).backgroundColor,
          };
        };
        return {
          twoD: pick("2D Grid"),
          threeD: pick("3D Scene"),
          standard: pick("Standard"),
          provenance: pick("Provenance"),
          occupancy: pick("Occupancy"),
          labels: pick("Labels"),
          editAnchors: pick("Edit Anchors"),
          viewTrack: trackOf("2D Grid"),
          modeTrack: trackOf("Standard"),
        };
      });

    const styles = await readStyles();
    // Segments inside a track share one height and one baseline.
    const segmentHeights = [
      styles.twoD,
      styles.threeD,
      styles.standard,
      styles.provenance,
      styles.occupancy,
    ].map((entry) => entry?.h);
    expect(new Set(segmentHeights).size).toBe(1);
    const segmentTops = [
      styles.twoD,
      styles.threeD,
      styles.standard,
      styles.provenance,
      styles.occupancy,
    ].map((entry) => entry?.top);
    expect(new Set(segmentTops).size).toBe(1);

    // Standalone controls match the outer band of the neighbouring groups, so the
    // toolbar reads as a single row instead of mixing 24px and 30px blocks.
    const outerBand = [
      styles.viewTrack,
      styles.modeTrack,
      styles.labels,
      styles.editAnchors,
    ];
    expect(outerBand.every(Boolean)).toBe(true);
    expect(new Set(outerBand.map((entry) => entry!.h)).size).toBe(1);
    expect(new Set(outerBand.map((entry) => entry!.top)).size).toBe(1);
    expect(styles.labels!.h).toBe(styles.viewTrack!.h);
    expect(styles.labels!.h).toBeGreaterThan(segmentHeights[0]!);

    // The unselected segment shows the track through; the selected one does not.
    expect(styles.twoD!.bg).toBe("rgba(0, 0, 0, 0)");
    expect(styles.threeD!.bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.threeD!.bg).not.toBe(styles.viewTrack!.bg);
    expect(styles.provenance!.color).not.toBe(styles.standard!.color);

    // Switching the mode moves the identified selection.
    await twoD.click();
    await expect(twoD).toHaveAttribute("aria-pressed", "true");
    await expect(threeD).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Operational Layout").first()).toBeVisible();
  });

  test("9. Drawers open and close as a transient, view-only interaction", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`,
    );
    await expect(page.locator("div.relative canvas").first()).toBeVisible({
      timeout: 15000,
    });

    const probe = () =>
      page.evaluate((selector) => {
        const host = document.querySelector(selector) as
          | (HTMLElement & {
              __ananyaDrawerProbe?: {
                getActiveDrawerId(): string | null;
                getDrawerLocationIds(): string[];
                getDrawerState(id: string): {
                  phase: string;
                  offsetMeters: number;
                  extensionMeters: number | null;
                  basePosition: { x: number; y: number; z: number };
                } | null;
                projectCompartmentCenter(
                  id: string,
                ): { clientX: number; clientY: number } | null;
              };
            })
          | null;
        const api = host?.__ananyaDrawerProbe;
        if (!api) return null;
        const id = api.getActiveDrawerId();
        return {
          active: id,
          ids: api.getDrawerLocationIds(),
          state: id ? api.getDrawerState(id) : null,
        };
      }, '[data-testid="spatial-3d-interaction-surface"]');

    // Drawer-like compartments are openable in the operational viewer.
    await expect
      .poll(async () => (await probe())?.ids.length ?? 0, { timeout: 15000 })
      .toBeGreaterThan(0);

    const surface = page.locator(
      '[data-testid="spatial-3d-interaction-surface"]',
    );
    await surface.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const before = (await probe())!;
    expect(before.active).toBeNull();
    const target = before.ids[0]!;
    const other = before.ids[1]!;
    const readState = (id: string) =>
      page.evaluate((locationId) => {
        const host = document.querySelector(
          '[data-testid="spatial-3d-interaction-surface"]',
        ) as HTMLElement & {
          __ananyaDrawerProbe?: {
            getDrawerState(id: string): {
              phase: string;
              offsetMeters: number;
              extensionMeters: number | null;
              basePosition: { x: number; y: number; z: number };
            } | null;
            projectCompartmentCenter(
              id: string,
            ): { clientX: number; clientY: number } | null;
          };
        };
        const api = host.__ananyaDrawerProbe;
        return {
          state: api?.getDrawerState(locationId) ?? null,
          point: api?.projectCompartmentCenter(locationId) ?? null,
        };
      }, id);

    const resting = (await readState(target)).state!.basePosition;

    // Persistence must be untouched by the view-only interaction.
    const countRows = async () => {
      const result = await pool.query<{ count: string }>(
        "SELECT count(*)::int AS count FROM spatial_nodes WHERE location_id = $1",
        [target],
      );
      return Number(result.rows[0]?.count ?? 0);
    };
    const rowsBefore = await countRows();

    const targetPoint = (await readState(target)).point;
    expect(targetPoint).not.toBeNull();
    await page.mouse.click(targetPoint!.clientX, targetPoint!.clientY);
    await expect
      .poll(async () => (await readState(target)).state?.phase ?? "missing", {
        timeout: 5000,
      })
      .toBe("open");
    const opened = (await readState(target)).state!;
    expect(opened.offsetMeters).toBeCloseTo(opened.extensionMeters!, 6);

    // Only one compartment may stay open: opening a second one returns the
    // first to its exact resting transform.
    const otherPoint = (await readState(other)).point;
    expect(otherPoint).not.toBeNull();
    await page.mouse.click(otherPoint!.clientX, otherPoint!.clientY);
    await expect
      .poll(async () => (await probe())!.active, { timeout: 5000 })
      .toBe(other);
    await expect
      .poll(async () => (await readState(target)).state?.phase ?? "missing", {
        timeout: 5000,
      })
      .toBe("closed");
    const closed = await readState(target);
    expect(closed.state!.offsetMeters).toBe(0);
    expect(closed.state!.basePosition).toEqual(resting);

    expect(await countRows()).toBe(rowsBefore);
  });

  test("10. Published warehouse placements are respected and containers stay fixed", async ({
    page,
  }) => {
    // The warehouse bay-plan layout positions four containers; three of its
    // seven children are intentionally unmapped and belong to the staging tray.
    await page.goto(`/inventory/locations/${DEMO_WAREHOUSE_ID}?view=spatial3d`);
    await expect(page.locator("div.relative canvas").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/4 in 3D \(3 unmapped\)/)).toBeVisible();

    // Containers are never slidable: clicking one selects it instead.
    const containers = await page.evaluate(() => {
      const host = document.querySelector(
        '[data-testid="spatial-3d-interaction-surface"]',
      ) as HTMLElement & {
        __ananyaDrawerProbe?: {
          getDrawerLocationIds(): string[];
          getActiveDrawerId(): string | null;
        };
      };
      const api = host.__ananyaDrawerProbe;
      return {
        openable: api ? api.getDrawerLocationIds() : [],
        active: api ? api.getActiveDrawerId() : null,
      };
    });
    expect(containers.openable).toEqual([]);
    expect(containers.active).toBeNull();
  });

  test("11. View switching honours an explicit view on focused deep links", async ({
    page,
  }) => {
    // The location detail page is routinely opened with a focus target, which
    // used to force the spatial canvas back on every URL sync.
    await page.goto(
      `/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d&focusLocation=${CABINET_LOCATION_ID}`,
    );
    await expect(page.locator("div.relative canvas").first()).toBeVisible({
      timeout: 15000,
    });

    const twoD = page.getByRole("button", { name: "2D Grid", exact: true });
    const tableView = page.getByRole("button", {
      name: "Table View",
      exact: true,
    });
    const spatialView = page.getByRole("button", {
      name: "Spatial View",
      exact: true,
    });

    // Switching to the table view sticks, even though the deep link carries a
    // focus target that also asks for the spatial canvas.
    await tableView.click();
    await expect(
      page.getByRole("main").getByText("DEMO-SPATIAL-DRAWER-A01").first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/view=list/);
    await expect(spatialView).toBeVisible();

    // ...and switching back restores the canvas toggle.
    await spatialView.click();
    await expect(twoD).toBeVisible({ timeout: 15000 });
    await expect(page).not.toHaveURL(/view=list/);
  });

  test("12. Inspector is an anchored, viewport-constrained inspector", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await page.goto(
      `/inventory/locations/${DEMO_WAREHOUSE_ID}?view=spatial`,
    );
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toBeVisible({ timeout: 15000 });

    // Selecting a card opens the detail panel.
    await page
      .locator('main button[aria-label^="Storage location DEMO-SPATIAL-RACK"]')
      .click();
    await expect(page.getByTestId("spatial-inspector-overlay")).toBeVisible();

    // Scroll the content container to the end so the footer is on screen.
    await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop = main.scrollHeight;
    });

    const geometry = await page.evaluate(() => {
      const panel = document.querySelector(
        '[data-testid="spatial-inspector-overlay"]',
      )!;
      const body = document.querySelector(
        '[data-testid="spatial-inspector-body"]',
      )!;
      const header = panel.firstElementChild!.firstElementChild!;
      const footer = document.querySelector("footer")!;
      const rect = panel.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        rect: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
        },
        footerTop: footerRect.top,
        headerTop: headerRect.top,
        headerWidth: headerRect.width,
        panelScrollWidth: panel.scrollWidth,
        panelClientWidth: panel.clientWidth,
        bodyScrollWidth: body.scrollWidth,
        bodyClientWidth: body.clientWidth,
        bodyScrollHeight: body.scrollHeight,
        bodyClientHeight: body.clientHeight,
      };
    });

    // Fully inside the usable viewport, and never over the footer.
    expect(geometry.rect.top).toBeGreaterThanOrEqual(0);
    expect(geometry.rect.left).toBeGreaterThanOrEqual(0);
    expect(geometry.rect.right).toBeLessThanOrEqual(geometry.viewport.w);
    expect(geometry.rect.bottom).toBeLessThanOrEqual(geometry.viewport.h);
    expect(geometry.rect.bottom).toBeLessThanOrEqual(geometry.footerTop);
    // Compact inspector width (360-440px band) rather than a page-wide panel.
    expect(geometry.rect.width).toBeLessThanOrEqual(440);

    // No horizontal scrollbar anywhere in the panel.
    expect(geometry.panelScrollWidth).toBeLessThanOrEqual(
      geometry.panelClientWidth,
    );
    expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(
      geometry.bodyClientWidth,
    );

    // Header and its controls fit the panel width.
    expect(geometry.headerWidth).toBeLessThanOrEqual(geometry.rect.width + 1);

    // The header stays pinned while the body scrolls.
    const before = geometry.headerTop;
    await page.evaluate(() => {
      const body = document.querySelector(
        '[data-testid="spatial-inspector-body"]',
      )!;
      body.scrollTop = body.scrollHeight;
    });
    const afterScroll = await page.evaluate(() => {
      const panel = document.querySelector(
        '[data-testid="spatial-inspector-overlay"]',
      )!;
      const body = document.querySelector(
        '[data-testid="spatial-inspector-body"]',
      )!;
      const header = panel.firstElementChild!.firstElementChild!;
      const closeButton = panel.querySelector(
        'button[aria-label="Close inspector (Esc)"]',
      )!;
      const closeRect = closeButton.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return {
        headerTop: header.getBoundingClientRect().top,
        bodyScrollTop: body.scrollTop,
        closeInside:
          closeRect.top >= panelRect.top &&
          closeRect.bottom <= panelRect.bottom &&
          closeRect.left >= panelRect.left &&
          closeRect.right <= panelRect.right,
      };
    });
    expect(Math.abs(afterScroll.headerTop - before)).toBeLessThanOrEqual(1);
    expect(afterScroll.bodyScrollTop).toBeGreaterThan(0);
    expect(afterScroll.closeInside).toBe(true);

    // Anchoring: the panel sits beside the selected card, not docked to a corner.
    await expect(page.getByTestId("spatial-inspector-overlay")).toHaveAttribute(
      "data-placement",
      "right",
    );
  });

  test("16. Detail panel behaves as a controlled drawer across selection, closing and small viewports", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto(`/inventory/locations/${DEMO_WAREHOUSE_ID}?view=spatial`);
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toBeVisible({ timeout: 15000 });

    const panel = page.getByTestId("spatial-inspector-overlay");
    const panelCode = () =>
      panel.evaluate(
        (el) =>
          el.querySelector(".font-mono.text-sm")?.textContent?.trim() ?? "",
      );

    // 1 + 10: opening on a mapped container preserves its mapping status.
    await page
      .locator('main button[aria-label^="Storage location DEMO-SPATIAL-RACK"]')
      .click();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("DEMO-SPATIAL-RACK");
    await expect(panel).toContainText("Model: DEMO-SPATIAL-MODEL-RACK");

    // 2 + 3 + 5: bounded inside the viewport, no horizontal overflow, and the
    // body owns the vertical scroll.
    const bounds = await panel.evaluate((el) => {
      const body = el.querySelector(
        '[data-testid="spatial-inspector-body"]',
      ) as HTMLElement;
      const rect = el.getBoundingClientRect();
      return {
        rect: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        bodyScrolls: body.scrollHeight > body.clientHeight,
        bodyOverflowX: getComputedStyle(body).overflowX,
        bodyOverflowY: getComputedStyle(body).overflowY,
      };
    });
    expect(bounds.rect.top).toBeGreaterThanOrEqual(0);
    expect(bounds.rect.left).toBeGreaterThanOrEqual(0);
    expect(bounds.rect.right).toBeLessThanOrEqual(bounds.viewport.w);
    expect(bounds.rect.bottom).toBeLessThanOrEqual(bounds.viewport.h);
    expect(bounds.bodyScrolls).toBe(true);
    expect(bounds.bodyOverflowX).toBe("hidden");
    expect(bounds.bodyOverflowY).toBe("auto");

    // 7: with the footer on screen the panel still clears it.
    await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop = main.scrollHeight;
    });
    const footerClearance = await page.evaluate(() => {
      const panelEl = document.querySelector(
        '[data-testid="spatial-inspector-overlay"]',
      )!;
      const footer = document.querySelector("footer")!;
      return footer.getBoundingClientRect().top - panelEl.getBoundingClientRect().bottom;
    });
    expect(footerClearance).toBeGreaterThan(0);

    // 8: selecting another container updates the same panel instance.
    const panelHandleBefore = await panel.elementHandle();
    await page
      .locator(
        'main button[aria-label^="Storage location DEMO-SPATIAL-CABINET-B"]',
      )
      .click();
    await expect.poll(panelCode).toBe("DEMO-SPATIAL-CABINET-B");
    const panelHandleAfter = await panel.elementHandle();
    expect(panelHandleAfter).toBe(panelHandleBefore);

    // 9: closing removes the panel (X button and Escape both work).
    await page.locator('button[aria-label="Close inspector (Esc)"]').click();
    await expect(panel).toHaveCount(0);

    await page
      .locator('main button[aria-label^="Storage location DEMO-SPATIAL-SHELF"]')
      .click();
    await expect(panel).toBeVisible();
    // 10: an unmapped container keeps reporting Unmapped.
    await expect(panel).toContainText("Unmapped");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  test("17. Inspector anchors to the selected object, follows the scene, and dismisses on outside clicks", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await page.goto(`/inventory/locations/${DEMO_WAREHOUSE_ID}?view=spatial`);
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toBeVisible({ timeout: 15000 });

    const panel = page.getByTestId("spatial-inspector-overlay");
    const cardFor = (code: string) =>
      page.locator(`main button[aria-label^="Storage location ${code},"]`);

    /** Panel rect, anchor rect, placement, and overflow facts in one round trip. */
    const readGeometry = () =>
      page.evaluate(() => {
        const panelEl = document.querySelector(
          '[data-testid="spatial-inspector-overlay"]',
        ) as HTMLElement | null;
        const body = document.querySelector(
          '[data-testid="spatial-inspector-body"]',
        ) as HTMLElement | null;
        if (!panelEl || !body) return null;
        const rect = panelEl.getBoundingClientRect();
        const code =
          panelEl
            .querySelector(".font-mono.text-sm")
            ?.textContent?.trim() ?? "";
        const card = document.querySelector(
          `main button[aria-label^="Storage location ${code},"]`,
        );
        const cardRect = card ? card.getBoundingClientRect() : null;
        const footer = document.querySelector("footer");
        return {
          placement: panelEl.getAttribute("data-placement"),
          panel: {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          },
          card: cardRect
            ? { top: cardRect.top, bottom: cardRect.bottom, left: cardRect.left, right: cardRect.right }
            : null,
          footerTop: footer ? footer.getBoundingClientRect().top : null,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          panelScrollWidth: panelEl.scrollWidth,
          panelClientWidth: panelEl.clientWidth,
          bodyScrollWidth: body.scrollWidth,
          bodyClientWidth: body.clientWidth,
        };
      });

    // 1 + 2: a card in the middle of the layout opens the inspector beside it.
    await cardFor(DEMO_CODES.rack).click();
    await expect(panel).toBeVisible();
    const middle = (await readGeometry())!;
    expect(middle.placement).toBe("right");
    expect(middle.card).not.toBeNull();
    // 12px-16px gutter, and the inspector overlaps the object vertically so the
    // selection stays visible and attributable.
    const gutter = middle.panel.left - middle.card!.right;
    expect(gutter).toBeGreaterThanOrEqual(12);
    expect(gutter).toBeLessThanOrEqual(16);
    expect(middle.panel.bottom).toBeGreaterThan(middle.card!.top);
    expect(middle.panel.top).toBeLessThan(middle.card!.bottom);
    expect(middle.panel.width).toBeGreaterThanOrEqual(300);
    expect(middle.panel.width).toBeLessThanOrEqual(440);

    // 3 + 4: a card near the trailing edge flips the inspector to its left.
    await cardFor(DEMO_CODES.tray).click();
    await expect.poll(async () => (await readGeometry())!.placement).toBe("left");
    const flipped = (await readGeometry())!;
    const flippedGutter = flipped.card!.left - flipped.panel.right;
    expect(flippedGutter).toBeGreaterThanOrEqual(12);
    expect(flippedGutter).toBeLessThanOrEqual(16);
    expect(flipped.panel.right).toBeLessThanOrEqual(flipped.viewport.w);

    // 5 + 6 + 10: always inside the viewport, never over the footer, and never
    // horizontally scrollable.
    expect(flipped.panel.top).toBeGreaterThanOrEqual(0);
    expect(flipped.panel.bottom).toBeLessThanOrEqual(flipped.viewport.h);
    expect(flipped.panel.left).toBeGreaterThanOrEqual(0);
    expect(flipped.panelScrollWidth).toBeLessThanOrEqual(flipped.panelClientWidth);
    expect(flipped.bodyScrollWidth).toBeLessThanOrEqual(flipped.bodyClientWidth);

    // 8: switching selection reuses the same inspector instance.
    await cardFor(DEMO_CODES.cabinetB).click();
    await expect(panel).toContainText("DEMO-SPATIAL-CABINET-B");
    const reused = (await readGeometry())!;
    expect(reused.panel.left).toBeGreaterThanOrEqual(0);
    expect(reused.panel.right).toBeLessThanOrEqual(reused.viewport.w);

    // 7: the footer stays clear once the scroll container is at its end.
    await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop = main.scrollHeight;
    });
    const scrolled = (await readGeometry())!;
    expect(scrolled.footerTop).not.toBeNull();
    expect(scrolled.panel.bottom).toBeLessThanOrEqual(scrolled.footerTop!);
    expect(scrolled.panel.bottom).toBeLessThanOrEqual(scrolled.viewport.h);

    // 17: the inspector repositions when the viewport shrinks.
    await page.setViewportSize({ width: 1280, height: 620 });
    await expect
      .poll(async () => {
        const geometry = await readGeometry();
        return geometry ? Math.round(geometry.viewport.w) : 0;
      })
      .toBe(1280);
    const resized = (await readGeometry())!;
    expect(resized.panel.right).toBeLessThanOrEqual(resized.viewport.w);
    expect(resized.panel.bottom).toBeLessThanOrEqual(resized.viewport.h);
    await page.setViewportSize({ width: 1440, height: 810 });

    // 13 + 14: clicking a non-interactive area outside closes it; Escape closes
    // it; clicking inside the inspector does not.
    await page.locator("h1").first().click();
    await expect(panel).toHaveCount(0);

    await cardFor(DEMO_CODES.rack).click();
    await expect(panel).toBeVisible();
    const bodyBox = (await page.getByTestId("spatial-inspector-body").boundingBox())!;
    await page.mouse.click(bodyBox.x + bodyBox.width / 2, bodyBox.y + 20);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("DEMO-SPATIAL-RACK");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    // 15: Enter/Open still navigates into the selected location.
    await cardFor(DEMO_CODES.rack).click();
    await page
      .locator('button[aria-label="Enter location DEMO-SPATIAL-RACK"]')
      .click();
    await expect(page).toHaveURL(new RegExp(`/inventory/locations/${DEMO_RACK_ID}`));

    // 18 + 19 + 20: the 3D view anchors to the projected object, survives camera
    // movement, never treats an inspector click as a scene click, and keeps the
    // authoritative mapping status.
    await page.goto(
      `/inventory/locations/${CABINET_B_LOCATION_ID}?view=spatial3d`,
    );
    const surface = page.getByTestId("spatial-3d-interaction-surface");
    await expect(surface).toBeVisible({ timeout: 15000 });
    await surface.scrollIntoViewIfNeeded();

    const drawerCenters = await page.evaluate(() => {
      const host = document.querySelector(
        '[data-testid="spatial-3d-interaction-surface"]',
      ) as (HTMLElement & {
        __ananyaDrawerProbe?: {
          getDrawerLocationIds(): string[];
          projectCompartmentCenter(
            id: string,
          ): { clientX: number; clientY: number } | null;
        };
      }) | null;
      const probe = host?.__ananyaDrawerProbe;
      if (!probe) return [];
      return probe
        .getDrawerLocationIds()
        .map((id) => {
          const center = probe.projectCompartmentCenter(id);
          return center
            ? { id, x: center.clientX, y: center.clientY }
            : null;
        })
        .filter((entry): entry is { id: string; x: number; y: number } =>
          Boolean(entry),
        );
    });
    expect(drawerCenters.length).toBeGreaterThan(0);

    const targetDrawer = drawerCenters[drawerCenters.length - 1];
    await page.mouse.click(targetDrawer.x, targetDrawer.y);
    await expect(panel).toBeVisible();
    const projected = await readGeometry();
    expect(projected).not.toBeNull();
    expect(projected!.panel.left).toBeGreaterThanOrEqual(0);
    expect(projected!.panel.right).toBeLessThanOrEqual(projected!.viewport.w);
    expect(projected!.panel.bottom).toBeLessThanOrEqual(projected!.viewport.h);
    expect(projected!.panel.width).toBeLessThanOrEqual(440);

    // Clicking inside the inspector must not reach the 3D scene.
    const projectedBody = (await page
      .getByTestId("spatial-inspector-body")
      .boundingBox())!;
    const labelBefore = await panel.getAttribute("aria-label");
    await page.mouse.click(
      projectedBody.x + projectedBody.width / 2,
      projectedBody.y + 20,
    );
    await expect(panel).toBeVisible();
    expect(await panel.getAttribute("aria-label")).toBe(labelBefore);
    await expect(panel).toContainText("Model: DEMO-SPATIAL-MODEL-DRAWER-B");

    // Orbiting the camera must never dismiss the inspector, and the panel must
    // follow the projected object without leaving the viewport.
    const beforeOrbit = (await readGeometry())!;
    const surfaceBox = (await surface.boundingBox())!;
    await page.mouse.move(surfaceBox.x + 80, surfaceBox.y + 60);
    await page.mouse.down();
    for (let step = 0; step < 8; step += 1) {
      await page.mouse.move(
        surfaceBox.x + 80 + step * 16,
        surfaceBox.y + 60 + step * 5,
      );
    }
    await page.mouse.up();
    await expect(panel).toBeVisible();
    await expect
      .poll(async () => {
        const geometry = await readGeometry();
        return geometry ? Math.round(geometry.panel.left) : beforeOrbit.panel.left;
      })
      .not.toBe(Math.round(beforeOrbit.panel.left));
    const afterOrbit = (await readGeometry())!;
    expect(afterOrbit.panel.left).toBeGreaterThanOrEqual(0);
    expect(afterOrbit.panel.right).toBeLessThanOrEqual(afterOrbit.viewport.w);
    expect(afterOrbit.panel.bottom).toBeLessThanOrEqual(afterOrbit.viewport.h);
    expect(afterOrbit.placement).toBe("right");

    // A real click on empty scene space closes the inspector.
    await page.mouse.click(surfaceBox.x + 20, surfaceBox.y + 20);
    await expect(panel).toHaveCount(0);
  });

  test("18. Inspector lifecycle closes through every path, including locate deep links", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    const panel = page.getByTestId("spatial-inspector-overlay");
    const closeButton = page.locator('button[aria-label="Close inspector (Esc)"]');
    const cardFor = (code: string) =>
      page.locator(`main button[aria-label^="Storage location ${code},"]`);
    const openCount = () => panel.count();

    // Regression: a locate deep link (?focusLocation=) used to make the inspector
    // impossible to close — the "reveal the focus target" effect re-selected it
    // whenever the selection was cleared.
    await page.goto(
      `/inventory/locations/${DEMO_WAREHOUSE_ID}?view=spatial&focusLocation=${DEMO_RACK_ID}`,
    );
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toBeVisible({ timeout: 15000 });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("DEMO-SPATIAL-RACK");

    // 1 + 2: the explicit close button closes it and it stays closed.
    await closeButton.click();
    await expect(panel).toHaveCount(0);
    await page.waitForTimeout(700);
    await expect(panel).toHaveCount(0);

    // The underlying layout stays interactive and no card stays selected.
    await expect(
      page.locator('[data-spatial-location-id][aria-pressed="true"]'),
    ).toHaveCount(0);
    await cardFor(DEMO_CODES.cabinetB).click();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("DEMO-SPATIAL-CABINET-B");

    // 3: Escape closes it.
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(panel).toHaveCount(0);

    // 4: an outside click closes it (a non-interactive page area).
    await cardFor(DEMO_CODES.rack).click();
    await expect(panel).toBeVisible();
    await page
      .locator("main")
      .getByRole("heading", { name: "Sub-Locations & Spatial Layout" })
      .click();
    await expect(panel).toHaveCount(0);

    // 5: selecting another location replaces the contents of the same instance
    // without ever creating a second inspector.
    await cardFor(DEMO_CODES.rack).click();
    const instanceBefore = await panel.elementHandle();
    await cardFor(DEMO_CODES.tray).click();
    await expect.poll(async () => openCount()).toBe(1);
    await expect(panel).toContainText("DEMO-SPATIAL-TRAY");
    expect(await panel.elementHandle()).toBe(instanceBefore);
    await closeButton.click();
    await expect(panel).toHaveCount(0);

    // 6: 2D/3D switching keeps the state coherent; a closed inspector stays closed.
    await cardFor(DEMO_CODES.cabinetB).click();
    await expect(panel).toBeVisible();
    await closeButton.click();
    await expect(panel).toHaveCount(0);
    await page.getByRole("button", { name: "3D Scene", exact: true }).click();
    await expect(page.getByTestId("spatial-3d-interaction-surface")).toBeVisible({
      timeout: 15000,
    });
    await expectStaysClosed(page, panel);
    await page.getByRole("button", { name: "2D Grid", exact: true }).click();
    await expect(page.locator("[data-testid='spatial-operational-bar']")).toBeVisible();
    await expectStaysClosed(page, panel);

    // 7: navigating away clears the inspector and returning does not resurrect it.
    await cardFor(DEMO_CODES.rack).click();
    await expect(panel).toBeVisible();
    await panel.locator('a[href^="/inventory/locations/"]').first().click();
    await expect(page).toHaveURL(new RegExp("/inventory/locations/[0-9a-f-]{36}"));
    await expect(panel).toHaveCount(0);
    await page.goBack();
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toBeVisible({ timeout: 15000 });
    await awaitClosed(panel);

    // 8: deep links still reveal a valid child target ...
    await page.goto(
      `/inventory/locations/${DEMO_WAREHOUSE_ID}?view=spatial&focusLocation=${CABINET_B_LOCATION_ID}`,
    );
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toBeVisible({ timeout: 15000 });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("DEMO-SPATIAL-CABINET-B");
    await closeButton.click();
    await expectStaysClosed(page, panel);

    // ... while a target that does not resolve under this parent never opens one.
    await page.goto(
      `/inventory/locations/${CABINET_B_LOCATION_ID}?view=spatial&focusLocation=${DEMO_RACK_ID}`,
    );
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toBeVisible({ timeout: 15000 });
    await expectStaysClosed(page, panel);
    await expect(
      page.locator('[data-spatial-location-id][aria-pressed="true"]'),
    ).toHaveCount(0);
  });

  test("19. Selected and locate-highlighted 2D cards render their full outline inside the grid", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await page.goto(`/inventory/locations/${DEMO_WAREHOUSE_ID}?view=spatial`);
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toBeVisible({ timeout: 15000 });

    await page
      .locator('main button[aria-label^="Storage location DEMO-SPATIAL-RACK"]')
      .click();
    await expect(page.getByTestId("spatial-inspector-overlay")).toBeVisible();

    /** Outer-ring room for every card, measured against the grid clip region. */
    const readRingRoom = () =>
      page.evaluate(() => {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>("[data-spatial-location-id]"),
        );
        const scroller = cards[0]?.parentElement?.parentElement;
        if (!scroller) return null;
        // An overflow container clips at its padding box; with no border this is
        // the element's own rect. A `ring-2` needs 2px of room on every side.
        const box = scroller.getBoundingClientRect();
        return cards.map((card) => {
          const rect = card.getBoundingClientRect();
          return {
            code: (card.getAttribute("aria-label") ?? "").split(",")[0],
            pressed: card.getAttribute("aria-pressed"),
            room: {
              left: rect.left - box.left,
              top: rect.top - box.top,
              right: box.right - rect.right,
              bottom: box.bottom - rect.bottom,
            },
          };
        });
      });

    const rooms = (await readRingRoom())!;
    expect(rooms.length).toBeGreaterThan(0);
    for (const card of rooms) {
      expect(card.room.left, `${card.code} left`).toBeGreaterThanOrEqual(2);
      expect(card.room.top, `${card.code} top`).toBeGreaterThanOrEqual(2);
      expect(card.room.right, `${card.code} right`).toBeGreaterThanOrEqual(2);
      expect(card.room.bottom, `${card.code} bottom`).toBeGreaterThanOrEqual(2);
    }

    // The active card paints its ring, and the outline band is inside the clip.
    const active = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>(
        '[data-spatial-location-id][aria-pressed="true"]',
      );
      if (!card) return null;
      const styles = getComputedStyle(card);
      return {
        ringWidth: styles.getPropertyValue("--tw-ring-shadow") || styles.boxShadow,
        overflowAncestorOverflow: getComputedStyle(
          card.parentElement!.parentElement!,
        ).overflowX,
      };
    });
    expect(active).not.toBeNull();
    expect(active!.ringWidth.length).toBeGreaterThan(0);
    expect(active!.overflowAncestorOverflow).toBe("auto");

    // The locate-target highlight uses the same ring geometry.
    await page.keyboard.press("Escape");
    await page.goto(
      `/inventory/locations/${DEMO_WAREHOUSE_ID}?view=spatial&focusLocation=${DEMO_RACK_ID}`,
    );
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toBeVisible({ timeout: 15000 });
    const highlightedRooms = (await readRingRoom())!;
    for (const card of highlightedRooms) {
      expect(card.room.left, `${card.code} left`).toBeGreaterThanOrEqual(2);
      expect(card.room.top, `${card.code} top`).toBeGreaterThanOrEqual(2);
    }
  });

  test("13. Location Details keeps one canonical section order with and without children", async ({
    page,
  }) => {
    const sectionOrder = async () =>
      page.evaluate(() => {
        const text = document.querySelector("main")?.innerText ?? "";
        return {
          summary: text.indexOf("Stored Components"),
          info: text.indexOf("Location Information"),
          components: text.indexOf("Containing Components & Stock"),
          subLocations: text.indexOf("Sub-Locations & Spatial Layout"),
        };
      });

    // Warehouse: has sub-locations and a spatial canvas.
    await page.goto(
      `/inventory/locations/${DEMO_WAREHOUSE_ID}?view=spatial3d`,
    );
    await expect(page.locator("main h1")).toContainText(
      "Demo Spatial Logistics Warehouse",
      { timeout: 15000 },
    );
    const withChildren = await sectionOrder();

    // Mapped leaf bin: no sub-locations at all.
    await page.goto(`/inventory/locations/${MAPPED_BIN_ID}`);
    await expect(page.locator("main h1")).toContainText("Demo Bin A01-01", {
      timeout: 15000,
    });
    const withoutChildren = await sectionOrder();

    for (const order of [withChildren, withoutChildren]) {
      expect(order.summary).toBeGreaterThanOrEqual(0);
      expect(order.info).toBeGreaterThan(order.summary);
      expect(order.components).toBeGreaterThan(order.info);
      expect(order.subLocations).toBeGreaterThan(order.components);
    }
  });

  test("14. A mapped leaf location states its mapping instead of looking unmapped", async ({
    page,
  }) => {
    await page.goto(`/inventory/locations/${MAPPED_BIN_ID}`);
    await expect(page.locator("main h1")).toContainText("Demo Bin A01-01", {
      timeout: 15000,
    });

    // Authoritative status chip in the header.
    await expect(page.getByText("Mapped", { exact: true }).first()).toBeVisible();
    // The empty sub-locations section explains why the bin is nevertheless mapped.
    await expect(
      page.getByText(
        "No sub-locations are nested under this location yet. This location has a spatial node",
        { exact: false },
      ),
    ).toBeVisible();

    // The unmapped sibling reports the opposite, and does not claim a mapping.
    await page.goto(`/inventory/locations/${UNMAPPED_DRAWER_ID}`);
    await expect(page.locator("main h1")).toContainText("Demo Drawer C01", {
      timeout: 15000,
    });
    await expect(
      page.getByText("Unmapped", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(
        "No sub-locations are nested under this location yet. This location has a spatial node",
        { exact: false },
      ),
    ).toHaveCount(0);
  });

  test("15. 2D and 3D views agree on the mapped compartment count", async ({
    page,
  }) => {
    await page.goto(`/inventory/locations/${DEMO_WAREHOUSE_ID}?view=spatial3d`);
    await expect(page.locator("div.relative canvas").first()).toBeVisible({
      timeout: 15000,
    });
    const threeDLabels = await page
      .locator("[data-testid='spatial-operational-bar']")
      .innerText();
    expect(threeDLabels).toContain("4 in 3D (3 unmapped)");

    // The 2D grid counts the same nodes as mapped.
    await page.getByRole("button", { name: "2D Grid", exact: true }).click();
    await expect(
      page.locator("[data-testid='spatial-operational-bar']"),
    ).toContainText("4 mapped (3 unmapped)");
  });
});
