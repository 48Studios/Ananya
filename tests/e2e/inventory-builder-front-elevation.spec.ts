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
    const match = fs
      .readFileSync(envPath, "utf8")
      .match(/^DATABASE_URL=(.+)$/m);
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
  // Scoped to <main>: the sidebar navigation also renders "Inventory Builder".
  await expect(
    page.getByRole("main").getByText("Inventory Builder"),
  ).toBeVisible();
  await expect(page.getByText("Mapped: 0 /")).toBeVisible();
  // Scoped to the header "Outer:" stat: the container inspector also shows the envelope.
  await expect(page.getByText(/Outer: 600 × 900 × 300 mm/)).toBeVisible();
  await expect(page.getByTestId("front-elevation-viewport")).toBeVisible();
}

test.describe("Inventory Builder Preview: Front Elevation & Container Assignment", () => {
  let pool: Pool;
  let sessionToken: string;
  let parentId: string;
  let parentCode: string;
  let childDrawerId: string;
  let childDrawerCode: string;
  let secondParentId: string;
  let secondParentCode: string;

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
    childDrawerId = crypto.randomUUID();
    childDrawerCode = `E2E-ELEV-DRW-${runSuffix}`;
    secondParentId = crypto.randomUUID();
    secondParentCode = `E2E-ELEV-ALT-${runSuffix}`;

    await pool.query(
      "INSERT INTO locations (id, code, name, kind, parent_id, is_active) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        parentId,
        parentCode,
        `E2E Elevation Cabinet ${runSuffix}`,
        "cabinet",
        null,
        true,
      ],
    );
    await pool.query(
      "INSERT INTO locations (id, code, name, kind, parent_id, is_active) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        childDrawerId,
        childDrawerCode,
        `E2E Elevation Drawer ${runSuffix}`,
        "drawer",
        parentId,
        true,
      ],
    );
    await pool.query(
      "INSERT INTO locations (id, code, name, kind, parent_id, is_active) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        secondParentId,
        secondParentCode,
        `E2E Elevation Cabinet Alt ${runSuffix}`,
        "cabinet",
        null,
        true,
      ],
    );
  });

  test.afterAll(async () => {
    if (pool) {
      for (const containerId of [parentId, secondParentId]) {
        await pool.query(
          "DELETE FROM spatial_layout_revisions WHERE layout_id IN (SELECT id FROM spatial_layouts WHERE parent_location_id = $1);",
          [containerId],
        );
        await pool.query(
          "DELETE FROM spatial_layout_mappings WHERE layout_id IN (SELECT id FROM spatial_layouts WHERE parent_location_id = $1);",
          [containerId],
        );
        await pool.query(
          "DELETE FROM spatial_layouts WHERE parent_location_id = $1;",
          [containerId],
        );
      }
      await pool.query("DELETE FROM locations WHERE id = $1;", [childDrawerId]);
      await pool.query("DELETE FROM locations WHERE id = $1;", [parentId]);
      await pool.query("DELETE FROM locations WHERE id = $1;", [
        secondParentId,
      ]);
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
    await page.goto(`/inventory/locations/spatial-builder?location=${parentId}`);
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
    await page.goto(`/inventory/locations/spatial-builder?location=${parentId}`);
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
    await page.goto(`/inventory/locations/spatial-builder?location=${parentId}`);
    await waitForWorkspaceReady(page);
    const viewport = page.getByTestId("front-elevation-viewport");

    // Reconfigure the container width: the elevation must follow the new geometry
    const widthInput = page.getByLabel("Width");
    await widthInput.fill("720");
    const containerRect = viewport.locator("svg > rect").first();
    await expect(containerRect).toHaveAttribute("width", "720");

    const a01 = page.locator('[data-slot-id="drawer_slot_r0_c0"] rect').first();
    const expectedCellWidth =
      (720 -
        2 * GRID.wallThicknessMm -
        (GRID.columns - 1) * GRID.dividerThicknessMm) /
      GRID.columns;
    // Polled reads: the DOM can settle a frame after the container width lands.
    await expect
      .poll(async () => Number(await a01.getAttribute("width")))
      .toBeCloseTo(expectedCellWidth, 1);
    // Slot IDs and the wall offset are preserved across the geometry change
    await expect
      .poll(async () => Number(await a01.getAttribute("x")))
      .toBeCloseTo(GRID.wallThicknessMm, 1);
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

  test("4. selects the top-level container independently of compartments in 2D and 3D", async ({
    page,
  }) => {
    await page.goto(`/inventory/locations/spatial-builder?location=${parentId}`);
    await waitForWorkspaceReady(page);

    const container = page.getByTestId("front-elevation-container");
    const a01 = page.locator('[data-slot-id="drawer_slot_r0_c0"]');

    // Default selection is the first compartment, not the container
    await expect(a01).toHaveAttribute("aria-pressed", "true");
    await expect(container).toHaveAttribute("aria-pressed", "false");

    // Clicking empty structural space inside the container boundary selects it
    await container.click({ position: { x: 2, y: 2 } });
    await expect(container).toHaveAttribute("aria-pressed", "true");
    await expect(a01).toHaveAttribute("aria-pressed", "false");
    const inspector = page.getByTestId("container-inspector");
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("Top-Level Container");
    await expect(inspector).toContainText(parentCode);
    await expect(inspector).toContainText("Assigned");

    // Clicking an inner compartment selects that compartment, not the container
    await a01.click();
    await expect(a01).toHaveAttribute("aria-pressed", "true");
    await expect(container).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Slot ID:")).toBeVisible();

    // Explicit container-selection control
    await page.getByTestId("container-selection-chip").click();
    await expect(container).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("header-container-chip")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Container selection is shared with the 3D view
    await page.getByRole("button", { name: "3D View" }).click();
    await expect(page.getByTestId("container-selection-badge")).toBeVisible();

    // Compartment selection clears the container selection in both views
    await page.getByRole("button", { name: "2D Grid" }).click();
    await a01.click();
    await expect(page.getByTestId("header-container-chip")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.getByRole("button", { name: "3D View" }).click();
    await expect(page.getByTestId("container-selection-badge")).toHaveCount(0);

    // Clicking the carcass selects the top-level container in 3D. The Top camera
    // preset places the carcass top wall between the camera and the compartments.
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(1000); // WebGL scene initialization
    await page.getByRole("button", { name: "Top plan camera view" }).click();
    await page.waitForTimeout(1000); // camera preset animation (0.4s) + settle
    const canvasBox = await canvas.boundingBox();
    await canvas.click({
      position: {
        x: Math.round((canvasBox?.width ?? 640) / 2),
        y: Math.round((canvasBox?.height ?? 480) / 2),
      },
    });
    await expect(page.getByTestId("container-selection-badge")).toBeVisible();
    await expect(page.getByTestId("header-container-chip")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("5. assigns a parent to a new unsaved layout and preserves it across save/reload", async ({
    page,
  }) => {
    await page.goto("/inventory/locations/spatial-builder");
    await waitForWorkspaceReady(page);

    // A brand-new draft starts with no container assignment
    const headerChip = page.getByTestId("header-container-chip");
    await expect(headerChip).toContainText("Unassigned");
    await expect(page.getByText("Mapped: 0 /")).toBeVisible();

    // Select the container and assign the parent through the existing picker
    await headerChip.click();
    await expect(page.getByTestId("container-inspector")).toBeVisible();
    await page
      .getByRole("button", { name: /Search and select warehouse/ })
      .click();
    await page.getByPlaceholder("Search storage locations...").fill(parentCode);
    await page.getByRole("button", { name: new RegExp(parentCode) }).click();

    await expect(headerChip).toContainText(parentCode);
    await expect(page.getByTestId("container-inspector")).toContainText(
      "Assigned",
    );
    await expect.poll(() => page.url()).toContain(`location=${parentId}`);

    // Save the draft: the container assignment is persisted as parentLocationId
    await page.getByRole("button", { name: "Save as Draft" }).click();
    await page.getByLabel("Layout Code *").fill(`LAYOUT-CONT-${parentCode}`);
    await page.getByLabel("Layout Name *").fill("Container Assignment Draft");
    await page.getByRole("button", { name: "Create Draft" }).click();
    await expect(page.getByText(/created successfully/i)).toBeVisible();

    // The container assignment did not create a compartment mapping
    await expect(page.getByText("Mapped: 0 /")).toBeVisible();

    // Reload: the parent assignment is restored from the persisted layout
    await page.reload();
    await expect(page.getByTestId("header-container-chip")).toContainText(
      parentCode,
    );
    await expect(page.getByText("Mapped: 0 /")).toBeVisible();
  });

  test("6. prevents a compartment-mapped location from also being the container", async ({
    page,
  }) => {
    await page.goto(`/inventory/locations/spatial-builder?location=${parentId}`);
    await waitForWorkspaceReady(page);

    // Map the child drawer to the default-selected compartment A01
    await page
      .getByRole("button", { name: /Search and select location to map/ })
      .click();
    await page
      .getByPlaceholder("Search by name, code, or kind...")
      .fill(childDrawerCode);
    await page
      .getByRole("button", { name: new RegExp(childDrawerCode) })
      .click();
    await expect(page.getByText("Mapped: 1 /")).toBeVisible();

    // The container picker disables that location instead of allowing a dual assignment
    await page
      .getByTestId("front-elevation-container")
      .click({ position: { x: 2, y: 2 } });
    await page.locator("#container-parent-location-select").click();
    await page
      .getByPlaceholder("Search storage locations...")
      .fill(childDrawerCode);

    const disabledOption = page.getByRole("button", {
      name: new RegExp(childDrawerCode),
    });
    await expect(disabledOption).toBeDisabled();
    await expect(disabledOption).toContainText("mapped to a compartment");
  });

  test("7. parent-first gate locks children and emphasises the container in 2D and 3D", async ({
    page,
  }) => {
    await page.goto("/inventory/locations/spatial-builder");
    await waitForWorkspaceReady(page);

    // The shared parent-first instruction is shown in 2D
    const callout2d = page.getByTestId("parent-first-callout-2d");
    await expect(callout2d).toBeVisible();
    await expect(callout2d).toContainText(
      "Step 1: Select the parent container",
    );
    await expect(callout2d).toContainText(
      "Assign an Ananya location to the outer container to enable drawer and compartment mapping.",
    );

    // The outer container is the active, visually emphasised target
    const container = page.getByTestId("front-elevation-container");
    await expect(container).toHaveAttribute("aria-pressed", "true");
    await expect(container).toHaveAttribute("stroke-dasharray", /\d/);
    await expect(page.getByTestId("container-inspector")).toBeVisible();

    // Children keep their geometry and labels but are visibly and accessibly locked
    await expect(page.getByTestId("front-elevation-slot")).toHaveCount(60);
    const a01 = page.locator('[data-slot-id="drawer_slot_r0_c0"]');
    await expect(a01).toHaveAttribute("data-disabled", "true");
    await expect(a01).toHaveAttribute("aria-disabled", "true");
    await expect(a01).toHaveAttribute("tabindex", "-1");
    await expect(a01.locator("rect").first()).toHaveAttribute("width", "55.2");

    // Clicking a child compartment cannot select it or open its mapping picker
    const slotBox = await a01.boundingBox();
    await page.mouse.click(
      (slotBox?.x ?? 0) + (slotBox?.width ?? 0) / 2,
      (slotBox?.y ?? 0) + (slotBox?.height ?? 0) / 2,
    );
    await expect(a01).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Slot ID:")).toHaveCount(0);
    await expect(page.getByTestId("container-inspector")).toBeVisible();

    // 3D shows the same instruction and the same container target
    await page.getByRole("button", { name: "3D View" }).click();
    const callout3d = page.getByTestId("parent-first-callout-3d");
    await expect(callout3d).toBeVisible();
    await expect(callout3d).toContainText(
      "Step 1: Select the parent container",
    );
    await expect(page.getByTestId("container-selection-badge")).toBeVisible();

    // Gated children are transparent to 3D clicks: the carcass receives them
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "Top plan camera view" }).click();
    await page.waitForTimeout(1000);
    const canvasBox = await canvas.boundingBox();
    await canvas.click({
      position: {
        x: Math.round((canvasBox?.width ?? 640) / 2),
        y: Math.round((canvasBox?.height ?? 480) / 2),
      },
    });
    await expect(page.getByTestId("container-selection-badge")).toBeVisible();
    await expect(page.getByTestId("header-container-chip")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("8. assigning a parent enables child interaction immediately in both views", async ({
    page,
  }) => {
    await page.goto("/inventory/locations/spatial-builder");
    await waitForWorkspaceReady(page);

    const a01 = page.locator('[data-slot-id="drawer_slot_r0_c0"]');
    await expect(a01).toHaveAttribute("aria-disabled", "true");

    // Assign the container location through the existing picker
    await page.getByTestId("header-container-chip").click();
    await page
      .getByRole("button", { name: /Search and select warehouse/ })
      .click();
    await page.getByPlaceholder("Search storage locations...").fill(parentCode);
    await page.getByRole("button", { name: new RegExp(parentCode) }).click();

    // Completion state replaces the instruction and children unlock immediately
    const complete2d = page.getByTestId("parent-first-callout-2d-complete");
    await expect(complete2d).toBeVisible();
    await expect(complete2d).toContainText("Step 1 complete");
    await expect(complete2d).toContainText(
      "Drawer and compartment selection and mapping are enabled.",
    );
    await expect(a01).not.toHaveAttribute("aria-disabled", "true");
    await expect(a01).not.toHaveAttribute("data-disabled", "true");

    // Child selection and mapping become available
    await a01.click();
    await expect(a01).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Slot ID:")).toBeVisible();

    // The same selection state survives a 2D -> 3D -> 2D round trip
    await page.getByRole("button", { name: "3D View" }).click();
    await expect(
      page.getByTestId("parent-first-callout-3d-complete"),
    ).toBeVisible();
    await expect(page.getByTestId("container-selection-badge")).toHaveCount(0);
    await page.getByRole("button", { name: "2D Grid" }).click();
    await expect(a01).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByTestId("parent-first-callout-2d-complete"),
    ).toBeVisible();
  });

  test("9. clearing the parent re-locks children without discarding mappings", async ({
    page,
  }) => {
    await page.goto(`/inventory/locations/spatial-builder?location=${parentId}`);
    await waitForWorkspaceReady(page);

    // Map the child drawer to the default-selected compartment A01
    await page
      .getByRole("button", { name: /Search and select location to map/ })
      .click();
    await page
      .getByPlaceholder("Search by name, code, or kind...")
      .fill(childDrawerCode);
    await page
      .getByRole("button", { name: new RegExp(childDrawerCode) })
      .click();
    await expect(page.getByText("Mapped: 1 /")).toBeVisible();
    await expect(
      page.getByTestId("parent-first-callout-2d-complete"),
    ).toBeVisible();

    // Clear the container assignment (dirty workspace -> confirmation)
    await page
      .getByTestId("front-elevation-container")
      .click({ position: { x: 2, y: 2 } });
    await page.getByTestId("container-clear-assignment").click();
    await expect(page.getByText("Discard Unsaved Changes?")).toBeVisible();
    await page.getByRole("button", { name: "Discard & Switch" }).click();

    // Step 1 returns and children lock again
    await expect(page.getByTestId("parent-first-callout-2d")).toBeVisible();
    const a01 = page.locator('[data-slot-id="drawer_slot_r0_c0"]');
    await expect(a01).toHaveAttribute("aria-disabled", "true");
    const slotBox = await a01.boundingBox();
    await page.mouse.click(
      (slotBox?.x ?? 0) + (slotBox?.width ?? 0) / 2,
      (slotBox?.y ?? 0) + (slotBox?.height ?? 0) / 2,
    );
    await expect(a01).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("container-inspector")).toBeVisible();

    // The existing mapping is preserved and explicitly flagged for review
    await expect(page.getByText("Mapped: 1 /")).toBeVisible();
    await expect(
      page.getByText(/Hierarchy Mismatch: 1 mapped slot/),
    ).toBeVisible();

    // 3D applies the same gate and keeps the container as the target
    await page.getByRole("button", { name: "3D View" }).click();
    await expect(page.getByTestId("parent-first-callout-3d")).toBeVisible();
    await expect(page.getByTestId("container-selection-badge")).toBeVisible();
  });

  test("10. naming dropdowns fill the panel column and truncate long values", async ({
    page,
  }) => {
    await page.goto(`/inventory/locations/spatial-builder?location=${parentId}`);
    await waitForWorkspaceReady(page);

    const rowOrderTrigger = page
      .locator('[data-slot="select-trigger"]')
      .filter({ hasText: "Top-to-Bottom" })
      .first();
    await expect(rowOrderTrigger).toBeVisible();

    const metrics = await rowOrderTrigger.evaluate((trigger) => {
      const value = trigger.querySelector<HTMLElement>(
        '[data-slot="select-value"]',
      );
      const chevron = trigger.querySelector("svg");
      const parent = trigger.parentElement;
      if (!value || !chevron || !parent) {
        throw new Error("Select trigger internals not found");
      }
      return {
        triggerWidth: trigger.getBoundingClientRect().width,
        parentWidth: parent.getBoundingClientRect().width,
        valueScrollWidth: value.scrollWidth,
        valueClientWidth: value.clientWidth,
        textOverflow: getComputedStyle(value).textOverflow,
        valueRight: value.getBoundingClientRect().right,
        chevronLeft: chevron.getBoundingClientRect().left,
        title: trigger.getAttribute("title"),
      };
    });

    // The trigger fills the panel column exactly (no overflow past the padding)
    expect(metrics.triggerWidth).toBeCloseTo(metrics.parentWidth, 0);
    // The long selected label truncates with an ellipsis instead of running
    // underneath the chevron
    expect(metrics.valueScrollWidth).toBeGreaterThan(metrics.valueClientWidth);
    expect(metrics.textOverflow).toBe("ellipsis");
    expect(metrics.valueRight).toBeLessThanOrEqual(metrics.chevronLeft);
    // The full label stays discoverable via the trigger tooltip
    expect(metrics.title).toContain("Top-to-Bottom");
  });
});
