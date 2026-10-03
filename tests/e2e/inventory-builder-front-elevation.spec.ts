import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import * as crypto from "crypto";
import fs from "node:fs";
import path from "node:path";

const ADMIN_USER_ID = "e941c06c-f461-4cac-88ed-d2197617d06b"; // admin@48studios.in

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Playwright runs from the repository root; reuse the local .env when present.
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, "utf8").match(/^DATABASE_URL=(.+)$/m);
    if (match?.[1]) return match[1].trim();
  }
  throw new Error(
    "DATABASE_URL is required to provision the front-elevation E2E fixture.",
  );
}

// Default SMD cabinet geometry produced by the parametric engine.
const CONTAINER = { widthMm: 600, heightMm: 900, depthMm: 300 };
const GRID = {
  rows: 6,
  columns: 10,
  wallThicknessMm: 15,
  dividerThicknessMm: 2,
};
const CELL_WIDTH_MM =
  (CONTAINER.widthMm -
    2 * GRID.wallThicknessMm -
    (GRID.columns - 1) * GRID.dividerThicknessMm) /
  GRID.columns; // 55.2 mm
const CELL_HEIGHT_MM =
  (CONTAINER.heightMm -
    2 * GRID.wallThicknessMm -
    (GRID.rows - 1) * GRID.dividerThicknessMm) /
  GRID.rows; // 143.33 mm

interface ElevationMetrics {
  containerWidthPx: number;
  containerHeightPx: number;
  slotWidthPx: number;
  slotHeightPx: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
}

/**
 * Measures the rendered screen-space size of the container envelope and one
 * compartment using getScreenCTM, which reflects the viewBox fit, zoom and pan
 * without stroke-width contamination.
 */
async function measureElevation(
  page: Page,
  slotId: string,
  container: { widthMm: number; heightMm: number },
): Promise<ElevationMetrics> {
  return page.evaluate(
    ({ id, widthMm, heightMm }) => {
      const viewport = document.querySelector(
        '[data-testid="front-elevation-viewport"]',
      );
      const svg = viewport?.querySelector("svg");
      const containerRect = svg?.querySelector("rect");
      const slotRect = document.querySelector(`[data-slot-id="${id}"] rect`);
      if (!viewport || !svg || !containerRect || !slotRect) {
        throw new Error("Front elevation geometry is not rendered.");
      }

      const containerCtm = (containerRect as SVGGraphicsElement).getScreenCTM();
      const slotCtm = (slotRect as SVGGraphicsElement).getScreenCTM();
      if (!containerCtm || !slotCtm) {
        throw new Error("Front elevation is not laid out yet.");
      }

      const transform = (ctm: DOMMatrix, x: number, y: number) => {
        const point = new DOMPoint(x, y).matrixTransform(ctm);
        return { x: point.x, y: point.y };
      };

      const containerTopLeft = transform(containerCtm, 0, 0);
      const containerBottomRight = transform(containerCtm, widthMm, heightMm);

      const slotX = Number(slotRect.getAttribute("x"));
      const slotY = Number(slotRect.getAttribute("y"));
      const slotWidth = Number(slotRect.getAttribute("width"));
      const slotHeight = Number(slotRect.getAttribute("height"));
      const slotTopLeft = transform(slotCtm, slotX, slotY);
      const slotBottomRight = transform(
        slotCtm,
        slotX + slotWidth,
        slotY + slotHeight,
      );

      const viewportBox = viewport.getBoundingClientRect();

      return {
        containerWidthPx: Math.abs(containerBottomRight.x - containerTopLeft.x),
        containerHeightPx: Math.abs(
          containerBottomRight.y - containerTopLeft.y,
        ),
        slotWidthPx: Math.abs(slotBottomRight.x - slotTopLeft.x),
        slotHeightPx: Math.abs(slotBottomRight.y - slotTopLeft.y),
        viewportWidthPx: viewportBox.width,
        viewportHeightPx: viewportBox.height,
      };
    },
    { id: slotId, widthMm: container.widthMm, heightMm: container.heightMm },
  );
}

test.describe.configure({ mode: "serial" });

/**
 * Waits until the workspace has finished its initial location/layout loading
 * pass, so interactions do not race with the first URL synchronization.
 */
async function waitForWorkspaceReady(page: Page): Promise<void> {
  await expect(page.getByText("Inventory Builder")).toBeVisible();
  await expect(page.getByText("Mapped: 0 /")).toBeVisible();
  await expect(page.getByText(/600 × 900 × 300 mm/)).toBeVisible();
  await expect(page.getByTestId("front-elevation-viewport")).toBeVisible();
}

test.describe("Inventory Builder 2D Front Elevation", () => {
  let pool: Pool;
  let sessionToken: string;
  let parentId: string;
  let parentCode: string;

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: resolveDatabaseUrl() });

    sessionToken = `test-elevation-auth-${crypto.randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      "INSERT INTO user_sessions (user_id, token, ip_address, user_agent, device_info, expires_at) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        ADMIN_USER_ID,
        sessionToken,
        "127.0.0.1",
        "playwright-builder-elevation",
        "Headless Chromium",
        expiresAt,
      ],
    );

    const runSuffix = crypto.randomBytes(3).toString("hex");
    parentId = crypto.randomUUID();
    parentCode = `E2E-ELEV-${runSuffix}`;
    await pool.query(
      "INSERT INTO locations (id, code, name, kind, parent_id, is_active) VALUES ($1, $2, $3, $4, $5, $6);",
      [parentId, parentCode, `E2E Elevation Cabinet ${runSuffix}`, "cabinet", null, true],
    );
  });

  test.afterAll(async () => {
    if (pool) {
      await pool.query(
        "DELETE FROM spatial_layout_revisions WHERE layout_id IN (SELECT id FROM spatial_layouts WHERE parent_location_id = $1);",
        [parentId],
      );
      await pool.query(
        "DELETE FROM spatial_layout_mappings WHERE layout_id IN (SELECT id FROM spatial_layouts WHERE parent_location_id = $1);",
        [parentId],
      );
      await pool.query("DELETE FROM spatial_layouts WHERE parent_location_id = $1;", [
        parentId,
      ]);
      await pool.query("DELETE FROM locations WHERE id = $1;", [parentId]);
      await pool.query(
        "DELETE FROM user_sessions WHERE user_agent = 'playwright-builder-elevation';",
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

  test("1. renders the front elevation with faithful physical proportions", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${parentId}`);
    await waitForWorkspaceReady(page);

    const viewport = page.getByTestId("front-elevation-viewport");

    // Outer envelope matches the physical container dimensions
    const containerRect = viewport.locator("svg > rect").first();
    await expect(containerRect).toHaveAttribute(
      "width",
      String(CONTAINER.widthMm),
    );
    await expect(containerRect).toHaveAttribute(
      "height",
      String(CONTAINER.heightMm),
    );

    // Every generated compartment is projected, with no equal-cell fallback
    await expect(page.getByTestId("front-elevation-slot")).toHaveCount(
      GRID.rows * GRID.columns,
    );

    const a01 = page.locator('[data-slot-id="drawer_slot_r0_c0"] rect').first();
    expect(Number(await a01.getAttribute("width"))).toBeCloseTo(
      CELL_WIDTH_MM,
      1,
    );
    expect(Number(await a01.getAttribute("height"))).toBeCloseTo(
      CELL_HEIGHT_MM,
      1,
    );
    // Wall offset at the top-left corner
    expect(Number(await a01.getAttribute("x"))).toBeCloseTo(
      GRID.wallThicknessMm,
      1,
    );
    expect(Number(await a01.getAttribute("y"))).toBeCloseTo(
      GRID.wallThicknessMm,
      1,
    );

    // Divider gap equals the physical divider thickness
    const a02 = page.locator('[data-slot-id="drawer_slot_r0_c1"] rect').first();
    const a01X = Number(await a01.getAttribute("x"));
    const a01Width = Number(await a01.getAttribute("width"));
    const a02X = Number(await a02.getAttribute("x"));
    expect(a02X - (a01X + a01Width)).toBeCloseTo(GRID.dividerThicknessMm, 1);

    // Labels are centred inside their own compartment (screen-space Y, not world Y)
    const a01Label = page
      .locator('[data-slot-id="drawer_slot_r0_c0"] text')
      .first();
    const a01Y = Number(await a01.getAttribute("y"));
    const a01Height = Number(await a01.getAttribute("height"));
    await expect(a01Label).toHaveAttribute("text-anchor", "middle");
    await expect(a01Label).toHaveAttribute("dominant-baseline", "central");
    expect(Number(await a01Label.getAttribute("x"))).toBeCloseTo(
      a01X + a01Width / 2,
      1,
    );
    expect(Number(await a01Label.getAttribute("y"))).toBeCloseTo(
      a01Y + a01Height / 2,
      1,
    );
    await expect(a01Label).toHaveText("A01");

    // Rendered proportions equal physical proportions (orthographic, no stretch)
    const metrics = await measureElevation(
      page,
      "drawer_slot_r0_c0",
      CONTAINER,
    );
    expect(metrics.slotWidthPx / metrics.slotHeightPx).toBeCloseTo(
      CELL_WIDTH_MM / CELL_HEIGHT_MM,
      2,
    );
    expect(metrics.containerWidthPx / metrics.containerHeightPx).toBeCloseTo(
      CONTAINER.widthMm / CONTAINER.heightMm,
      2,
    );
    expect(metrics.containerWidthPx / metrics.slotWidthPx).toBeCloseTo(
      CONTAINER.widthMm / CELL_WIDTH_MM,
      1,
    );

    // The complete elevation fits inside the viewport at base zoom
    expect(metrics.containerWidthPx).toBeLessThanOrEqual(
      metrics.viewportWidthPx + 1,
    );
    expect(metrics.containerHeightPx).toBeLessThanOrEqual(
      metrics.viewportHeightPx + 1,
    );
  });

  test("2. keeps 2D and 3D selection synchronized through shared state", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${parentId}`);
    await waitForWorkspaceReady(page);

    const a01 = page.locator('[data-slot-id="drawer_slot_r0_c0"]');
    const a02 = page.locator('[data-slot-id="drawer_slot_r0_c1"]');

    // First generated slot is selected by default
    await expect(a01).toHaveAttribute("aria-pressed", "true");

    // Selecting in 2D updates the shared selection used by the 3D viewport
    await a02.click();
    await expect(a02).toHaveAttribute("aria-pressed", "true");
    await expect(a01).toHaveAttribute("aria-pressed", "false");
    // The inspector reflects the same selected slot identity
    await expect(page.getByText("drawer_slot_r0_c1")).toBeVisible();

    // Switching to 3D and back preserves the selected slot
    await page.getByRole("button", { name: "3D View" }).click();
    await page.getByRole("button", { name: "2D Grid" }).click();
    await expect(a02).toHaveAttribute("aria-pressed", "true");
    await expect(a01).toHaveAttribute("aria-pressed", "false");
  });

  test("3. updates the projection when geometry changes and zooms without distortion", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${parentId}`);
    await waitForWorkspaceReady(page);
    const viewport = page.getByTestId("front-elevation-viewport");

    // Reconfigure the container width: the elevation must follow the new geometry
    const widthInput = page.getByLabel("Width");
    await widthInput.fill("720");
    const containerRect = viewport.locator("svg > rect").first();
    await expect(containerRect).toHaveAttribute("width", "720");

    const a01 = page.locator('[data-slot-id="drawer_slot_r0_c0"] rect').first();
    const expectedCellWidth =
      (720 - 2 * GRID.wallThicknessMm - (GRID.columns - 1) * GRID.dividerThicknessMm) /
      GRID.columns;
    expect(Number(await a01.getAttribute("width"))).toBeCloseTo(
      expectedCellWidth,
      1,
    );
    // Slot IDs and the wall offset are preserved across the geometry change
    expect(Number(await a01.getAttribute("x"))).toBeCloseTo(
      GRID.wallThicknessMm,
      1,
    );
    await expect(page.getByTestId("front-elevation-slot")).toHaveCount(
      GRID.rows * GRID.columns,
    );

    // Zooming keeps proportions intact
    const before = await measureElevation(page, "drawer_slot_r0_c0", {
      widthMm: 720,
      heightMm: CONTAINER.heightMm,
    });
    await page.getByRole("button", { name: "Zoom in front elevation" }).click();
    const after = await measureElevation(page, "drawer_slot_r0_c0", {
      widthMm: 720,
      heightMm: CONTAINER.heightMm,
    });
    expect(after.slotWidthPx).toBeGreaterThan(before.slotWidthPx);
    expect(after.slotWidthPx / after.slotHeightPx).toBeCloseTo(
      before.slotWidthPx / before.slotHeightPx,
      2,
    );

    // Fit restores the base scale
    await page.getByRole("button", { name: "Fit layout to viewport" }).click();
    const fitted = await measureElevation(page, "drawer_slot_r0_c0", {
      widthMm: 720,
      heightMm: CONTAINER.heightMm,
    });
    expect(fitted.slotWidthPx).toBeCloseTo(before.slotWidthPx, 0);
  });
});
