import { test, expect, requireE2EAuth } from "../fixtures/test.fixture";
import type { Page } from "@playwright/test";
import { Pool } from "pg";
import * as crypto from "crypto";
import fs from "node:fs";
import path from "node:path";
test.beforeEach(() => requireE2EAuth());

const ADMIN_USER_ID = "e941c06c-f461-4cac-88ed-d2197617d06b"; // admin@48studios.in

const PROBE_SELECTOR = '[data-testid="spatial-3d-interaction-surface"]';

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
    "DATABASE_URL is required to provision the drawer-opening E2E fixture.",
  );
}

interface VectorSnapshot {
  x: number;
  y: number;
  z: number;
}

interface DrawerStateSnapshot {
  phase: "opening" | "open" | "closing" | "closed";
  progress: number;
  offsetMeters: number;
  extensionMeters: number | null;
  basePosition: VectorSnapshot;
  position: VectorSnapshot;
  frontAxis: VectorSnapshot;
  activeDrawerId: string | null;
}

interface DrawerProbe {
  getActiveDrawerId(): string | null;
  getDrawerLocationIds(): string[];
  isCameraAnimating(): boolean;
  getDrawerState(locationId: string): DrawerStateSnapshot | null;
  projectCompartmentCenter(
    locationId: string,
  ): { clientX: number; clientY: number } | null;
}

interface DrawerProbeHost extends HTMLElement {
  __ananyaDrawerProbe?: DrawerProbe;
}

async function getDrawerLocationIds(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const host = document.querySelector(selector) as DrawerProbeHost | null;
    return host?.__ananyaDrawerProbe?.getDrawerLocationIds() ?? [];
  }, PROBE_SELECTOR);
}

async function getActiveDrawerId(page: Page): Promise<string | null> {
  return page.evaluate((selector) => {
    const host = document.querySelector(selector) as DrawerProbeHost | null;
    return host?.__ananyaDrawerProbe?.getActiveDrawerId() ?? null;
  }, PROBE_SELECTOR);
}

async function getDrawerState(
  page: Page,
  locationId: string,
): Promise<DrawerStateSnapshot | null> {
  return page.evaluate(
    ({ selector, id }) => {
      const host = document.querySelector(selector) as DrawerProbeHost | null;
      return host?.__ananyaDrawerProbe?.getDrawerState(id) ?? null;
    },
    { selector: PROBE_SELECTOR, id: locationId },
  );
}

async function isCameraAnimating(page: Page): Promise<boolean> {
  return page.evaluate((selector) => {
    const host = document.querySelector(selector) as DrawerProbeHost | null;
    return host?.__ananyaDrawerProbe?.isCameraAnimating() ?? false;
  }, PROBE_SELECTOR);
}

async function waitForCameraSettled(page: Page): Promise<void> {
  await expect
    .poll(() => isCameraAnimating(page), { timeout: 15000 })
    .toBe(false);
}

async function waitForDrawerPhase(
  page: Page,
  locationId: string,
  phase: DrawerStateSnapshot["phase"],
): Promise<DrawerStateSnapshot> {
  await expect
    .poll(
      async () => (await getDrawerState(page, locationId))?.phase ?? "missing",
      { timeout: 15000 },
    )
    .toBe(phase);
  const state = await getDrawerState(page, locationId);
  if (!state)
    throw new Error(`Drawer ${locationId} disappeared from the scene`);
  return state;
}

/**
 * Clicks a compartment through its real projected front face. The probe exposes the
 * screen position of the compartment's interactive surface, so the click exercises the
 * same raycast path a user triggers without duplicating camera math in the test.
 */
async function clickDrawer(page: Page, locationId: string): Promise<void> {
  const surface = page.locator(PROBE_SELECTOR);
  // The builder page is taller than the viewport, so make sure the 3D surface is
  // actually on screen before dispatching a real mouse click at projected pixels.
  await surface.scrollIntoViewIfNeeded();

  const point = await page.evaluate(
    ({ selector, id }) => {
      const host = document.querySelector(selector) as DrawerProbeHost | null;
      return host?.__ananyaDrawerProbe?.projectCompartmentCenter(id) ?? null;
    },
    { selector: PROBE_SELECTOR, id: locationId },
  );
  if (!point) throw new Error(`Unable to project drawer ${locationId}`);

  const box = await surface.boundingBox();
  if (!box) throw new Error("3D interaction surface is not laid out");
  if (
    point.clientX < box.x ||
    point.clientX > box.x + box.width ||
    point.clientY < box.y ||
    point.clientY > box.y + box.height
  ) {
    throw new Error(
      `Drawer ${locationId} projects outside the 3D viewport (${Math.round(
        point.clientX,
      )}, ${Math.round(point.clientY)})`,
    );
  }

  await page.mouse.click(point.clientX, point.clientY);
}

/** Resets the camera so every compartment is back in frame before projecting a click. */
async function resetCamera(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Isometric camera view" }).click();
  await waitForCameraSettled(page);
}

/**
 * Records per-frame drawer progress around a real click so the easing curve can be
 * asserted (monotonic, intermediate frames, no abrupt snap).
 */
async function startMotionSampler(
  page: Page,
  locationId: string,
): Promise<void> {
  await page.evaluate(
    ({ selector, id }) => {
      const host = document.querySelector(selector) as DrawerProbeHost | null;
      const probe = host?.__ananyaDrawerProbe;
      if (!probe) throw new Error("Drawer probe unavailable");
      const samples: number[] = [];
      (window as unknown as { __drawerSamples: number[] }).__drawerSamples =
        samples;
      const tick = () => {
        const state = probe.getDrawerState(id);
        samples.push(state ? state.progress : -1);
        (
          window as unknown as { __drawerSamplerFrame: number }
        ).__drawerSamplerFrame = requestAnimationFrame(tick);
      };
      tick();
    },
    { selector: PROBE_SELECTOR, id: locationId },
  );
}

async function stopMotionSampler(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const frame = (window as unknown as { __drawerSamplerFrame?: number })
      .__drawerSamplerFrame;
    if (typeof frame === "number") cancelAnimationFrame(frame);
    return (
      (window as unknown as { __drawerSamples?: number[] }).__drawerSamples ??
      []
    );
  });
}

function expectSmoothCurve(samples: number[], target: 0 | 1): void {
  expect(samples.length).toBeGreaterThan(4);
  expect(samples).not.toContain(-1);

  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  if (target === 1) {
    // Starts from rest and is clearly under way before the window ends; the settled
    // end state is asserted separately so a slow frame under load cannot fail here.
    expect(first).toBeLessThan(0.5);
    expect(last).toBeGreaterThan(0.5);
  } else {
    expect(first).toBeGreaterThan(0.5);
    expect(last).toBeLessThan(0.5);
  }

  let previous = samples[0]!;
  let maxStep = 0;
  for (const sample of samples.slice(1)) {
    const step = sample - previous;
    if (target === 1) {
      expect(step).toBeGreaterThanOrEqual(-1e-6);
    } else {
      expect(step).toBeLessThanOrEqual(1e-6);
    }
    maxStep = Math.max(maxStep, Math.abs(step));
    previous = sample;
  }
  // Every frame moves by a small, eased fraction: no teleporting between states.
  expect(maxStep).toBeLessThan(0.6);
  // At least one frame captured a genuine in-between pose.
  expect(samples.some((sample) => sample > 0.05 && sample < 0.95)).toBe(true);
}

async function waitForWorkspaceReady(
  page: Page,
  parentCode: string,
): Promise<void> {
  await expect(
    page.getByRole("main").getByText("Inventory Builder"),
  ).toBeVisible();
  await expect(page.getByTestId("header-container-chip")).toContainText(
    parentCode,
  );
  await expect(page.getByText(/Mapped: 0 \//)).toBeVisible();
  await expect(page.getByTestId("front-elevation-viewport")).toBeVisible();
}

async function open3DView(page: Page): Promise<void> {
  await page.getByRole("button", { name: "3D View" }).click();
  const surface = page.locator(PROBE_SELECTOR);
  await expect(surface.locator("canvas")).toBeVisible({
    timeout: 15000,
  });
  await expect
    .poll(async () => (await getDrawerLocationIds(page)).length, {
      timeout: 15000,
    })
    .toBeGreaterThan(0);
  await surface.scrollIntoViewIfNeeded();
  await waitForCameraSettled(page);
}

test.describe.configure({ mode: "serial" });

test.describe("Inventory Builder 3D — Interactive Drawer Opening", () => {
  let pool: Pool;
  let sessionToken: string;
  let parentId: string;
  let parentCode: string;
  let childDrawerId: string;
  let childDrawerCode: string;

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: resolveDatabaseUrl() });

    sessionToken = `test-drawer-open-${crypto.randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      "INSERT INTO user_sessions (user_id, token, ip_address, user_agent, device_info, expires_at) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        ADMIN_USER_ID,
        sessionToken,
        "127.0.0.1",
        "playwright-builder-drawer-opening",
        "Headless Chromium",
        expiresAt,
      ],
    );

    const runSuffix = crypto.randomBytes(3).toString("hex");
    parentId = crypto.randomUUID();
    parentCode = `E2E-DRAWER-${runSuffix}`;
    childDrawerId = crypto.randomUUID();
    childDrawerCode = `E2E-DRAWER-CHILD-${runSuffix}`;

    await pool.query(
      "INSERT INTO locations (id, code, name, kind, parent_id, is_active) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        parentId,
        parentCode,
        `E2E Drawer Cabinet ${runSuffix}`,
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
        `E2E Drawer Location ${runSuffix}`,
        "drawer",
        parentId,
        true,
      ],
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
      await pool.query(
        "DELETE FROM spatial_layouts WHERE parent_location_id = $1;",
        [parentId],
      );
      await pool.query("DELETE FROM locations WHERE id = $1;", [childDrawerId]);
      await pool.query("DELETE FROM locations WHERE id = $1;", [parentId]);
      if (sessionToken) {
        await pool.query("DELETE FROM user_sessions WHERE token = $1;", [
          sessionToken,
        ]);
      }
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

  test("1. clicking a closed drawer opens it smoothly and clicking it again returns it exactly home", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/spatial-builder?location=${parentId}`,
    );
    await waitForWorkspaceReady(page, parentCode);
    await open3DView(page);

    const ids = await getDrawerLocationIds(page);
    const slotId = ids[Math.floor(ids.length / 2)]!;

    // Closed by default: no transient motion state at all.
    const initial = await getDrawerState(page, slotId);
    expect(initial).not.toBeNull();
    expect(initial!.phase).toBe("closed");
    expect(initial!.progress).toBe(0);
    expect(initial!.offsetMeters).toBe(0);

    // Open with a real click and capture the easing curve.
    await startMotionSampler(page, slotId);
    await clickDrawer(page, slotId);
    await page.waitForTimeout(900);
    const openingSamples = await stopMotionSampler(page);
    expectSmoothCurve(openingSamples, 1);

    const open = await waitForDrawerPhase(page, slotId, "open");
    // Opening travels along the compartment's own front (+Z) axis toward the viewer.
    expect(open.frontAxis.z).toBeCloseTo(1, 6);
    expect(open.frontAxis.x).toBeCloseTo(0, 6);
    expect(open.frontAxis.y).toBeCloseTo(0, 6);
    expect(open.offsetMeters).toBeGreaterThan(0.05);
    expect(open.extensionMeters).not.toBeNull();
    expect(open.offsetMeters).toBeCloseTo(open.extensionMeters!, 6);
    expect(open.position.z - open.basePosition.z).toBeCloseTo(
      open.offsetMeters,
      6,
    );
    // Travel never drifts sideways or vertically.
    expect(open.position.x - open.basePosition.x).toBeCloseTo(0, 9);
    expect(open.position.y - open.basePosition.y).toBeCloseTo(0, 9);
    expect(open.activeDrawerId).toBe(slotId);

    // The click selected the same slot the mapping workflow uses.
    await expect(page.getByTestId("compartment-inspector")).toContainText(
      slotId,
    );

    // Click the extended drawer again: it closes back to its exact resting pose.
    await waitForCameraSettled(page);
    await startMotionSampler(page, slotId);
    await clickDrawer(page, slotId);
    await page.waitForTimeout(900);
    const closingSamples = await stopMotionSampler(page);
    expectSmoothCurve(closingSamples, 0);

    const closed = await waitForDrawerPhase(page, slotId, "closed");
    expect(closed.progress).toBe(0);
    expect(closed.offsetMeters).toBe(0);
    expect(closed.position.x).toBeCloseTo(closed.basePosition.x, 12);
    expect(closed.position.y).toBeCloseTo(closed.basePosition.y, 12);
    expect(closed.position.z).toBeCloseTo(closed.basePosition.z, 12);
    expect(await getActiveDrawerId(page)).toBeNull();
    // Closing is purely visual: the slot stays selected for mapping.
    await expect(page.getByTestId("compartment-inspector")).toContainText(
      slotId,
    );
  });

  test("2. opening another drawer closes the previous one (single active drawer)", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/spatial-builder?location=${parentId}`,
    );
    await waitForWorkspaceReady(page, parentCode);
    await open3DView(page);

    const ids = await getDrawerLocationIds(page);
    const firstId = ids[Math.floor(ids.length / 2)]!;
    const secondId = ids[Math.floor(ids.length / 2) + 5]!;

    await clickDrawer(page, firstId);
    await waitForDrawerPhase(page, firstId, "open");
    expect(await getActiveDrawerId(page)).toBe(firstId);

    await waitForCameraSettled(page);
    await clickDrawer(page, secondId);
    const second = await waitForDrawerPhase(page, secondId, "open");

    const first = await getDrawerState(page, firstId);
    expect(first).not.toBeNull();
    await expect
      .poll(async () => (await getDrawerState(page, firstId))?.phase, {
        timeout: 15000,
      })
      .toBe("closed");
    const settledFirst = await getDrawerState(page, firstId);
    expect(settledFirst!.position.x).toBeCloseTo(
      settledFirst!.basePosition.x,
      12,
    );
    expect(settledFirst!.position.y).toBeCloseTo(
      settledFirst!.basePosition.y,
      12,
    );
    expect(settledFirst!.position.z).toBeCloseTo(
      settledFirst!.basePosition.z,
      12,
    );
    expect(await getActiveDrawerId(page)).toBe(secondId);
    expect(second.activeDrawerId).toBe(secondId);
    expect(second.position.z).toBeGreaterThan(second.basePosition.z);
  });

  test("3. empty-space clicks close the open drawer without disturbing selection or camera controls", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/spatial-builder?location=${parentId}`,
    );
    await waitForWorkspaceReady(page, parentCode);
    await open3DView(page);

    const ids = await getDrawerLocationIds(page);
    const slotId = ids[Math.floor(ids.length / 2)]!;

    await clickDrawer(page, slotId);
    await waitForDrawerPhase(page, slotId, "open");
    await expect(page.getByTestId("compartment-inspector")).toContainText(
      slotId,
    );

    const surface = page.locator(PROBE_SELECTOR);
    await surface.scrollIntoViewIfNeeded();
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();

    // Bottom-centre of the canvas is empty background/ground grid: no compartment hit.
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height - 24);
    await waitForDrawerPhase(page, slotId, "closed");
    expect(await getActiveDrawerId(page)).toBeNull();

    // The empty-space click did not steal or clear the slot selection.
    await expect(page.getByTestId("compartment-inspector")).toContainText(
      slotId,
    );

    // Orbit and zoom still work after the interaction.
    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 70, centerY + 25, { steps: 8 });
    await page.mouse.up();
    await page.mouse.wheel(0, -120);
    await waitForCameraSettled(page);

    await expect(surface.locator("canvas")).toBeVisible();
    expect((await getDrawerState(page, slotId))?.phase).toBe("closed");
  });

  test("4. opening drawers selects the mapping slot and never mutates persisted state", async ({
    page,
  }) => {
    const countRows = async (sql: string, params: unknown[]) => {
      const result = await pool.query<{ count: string }>(sql, params);
      return Number(result.rows[0]?.count ?? 0);
    };
    const layoutCountSql =
      "SELECT count(*)::int AS count FROM spatial_layouts WHERE parent_location_id = $1";
    const mappingCountSql =
      "SELECT count(*)::int AS count FROM spatial_layout_mappings WHERE layout_id IN (SELECT id FROM spatial_layouts WHERE parent_location_id = $1)";
    const revisionCountSql =
      "SELECT count(*)::int AS count FROM spatial_layout_revisions WHERE layout_id IN (SELECT id FROM spatial_layouts WHERE parent_location_id = $1)";
    const locationCountSql = "SELECT count(*)::int AS count FROM locations";

    const before = {
      layouts: await countRows(layoutCountSql, [parentId]),
      mappings: await countRows(mappingCountSql, [parentId]),
      revisions: await countRows(revisionCountSql, [parentId]),
      locations: await countRows(locationCountSql, []),
    };

    await page.goto(
      `/inventory/locations/spatial-builder?location=${parentId}`,
    );
    await waitForWorkspaceReady(page, parentCode);
    await open3DView(page);

    const ids = await getDrawerLocationIds(page);
    const slotId = ids[Math.floor(ids.length / 2)]!;

    await clickDrawer(page, slotId);
    await waitForDrawerPhase(page, slotId, "open");
    // Clicking a drawer selects its slot; it must not create a location mapping.
    await expect(page.getByTestId("compartment-inspector")).toContainText(
      slotId,
    );
    await expect(page.getByText(/Mapped: 0 \//)).toBeVisible();

    // The existing location picker is still available for the opened slot.
    await page
      .getByRole("button", { name: /Search and select location to map/ })
      .click();
    await page
      .getByPlaceholder("Search by name, code, or kind...")
      .fill(childDrawerCode);
    await page
      .getByRole("button", { name: new RegExp(childDrawerCode) })
      .click();
    await expect(page.getByText(/Mapped: 1 \//)).toBeVisible();

    // Mapping while the drawer is open must not snap it closed or move it.
    const openDuringMapping = await getDrawerState(page, slotId);
    expect(openDuringMapping).not.toBeNull();
    expect(openDuringMapping!.phase).toBe("open");
    expect(openDuringMapping!.offsetMeters).toBeCloseTo(
      openDuringMapping!.extensionMeters!,
      6,
    );
    expect(await getActiveDrawerId(page)).toBe(slotId);

    // Close it again and confirm the draft mapping survives.
    await waitForCameraSettled(page);
    await clickDrawer(page, slotId);
    await waitForDrawerPhase(page, slotId, "closed");
    await expect(page.getByText(/Mapped: 1 \//)).toBeVisible();

    const after = {
      layouts: await countRows(layoutCountSql, [parentId]),
      mappings: await countRows(mappingCountSql, [parentId]),
      revisions: await countRows(revisionCountSql, [parentId]),
      locations: await countRows(locationCountSql, []),
    };
    expect(after).toEqual(before);
  });

  test("5. every parametric template opens compartments and template switches clear transient state", async ({
    page,
  }) => {
    await page.goto(
      `/inventory/locations/spatial-builder?location=${parentId}`,
    );
    await waitForWorkspaceReady(page, parentCode);
    await open3DView(page);

    const templates = [
      { button: /^SMD Cabinet/, label: "SMD drawer cabinet" },
      { button: /^Open Bins/, label: "open bin matrix" },
      { button: /^Pallet Rack/, label: "pallet rack" },
      { button: /^Parts Tray/, label: "grid parts tray" },
    ];

    let openDrawerId: string | null = null;
    for (const template of templates) {
      await page.getByRole("button", { name: template.button }).click();
      await expect
        .poll(async () => (await getDrawerLocationIds(page)).length, {
          timeout: 15000,
        })
        .toBeGreaterThan(0);
      await resetCamera(page);

      const ids = await getDrawerLocationIds(page);
      const slotId = ids[Math.floor(ids.length / 2)]!;

      await clickDrawer(page, slotId);
      const open = await waitForDrawerPhase(page, slotId, "open");
      expect(
        open.frontAxis.z,
        `${template.label} compartment must open along its front axis`,
      ).toBeCloseTo(1, 6);
      expect(
        open.offsetMeters,
        `${template.label} compartment must travel outward`,
      ).toBeGreaterThan(0.01);
      openDrawerId = slotId;
    }

    // The last template left a drawer open; switching templates must not orphan it.
    expect(openDrawerId).not.toBeNull();
    await page.getByRole("button", { name: templates[0]!.button }).click();
    await expect
      .poll(async () => (await getDrawerLocationIds(page)).length, {
        timeout: 15000,
      })
      .toBeGreaterThan(0);
    await expect
      .poll(() => getActiveDrawerId(page), { timeout: 15000 })
      .toBeNull();
    expect(await getDrawerState(page, openDrawerId!)).toBeNull();
    const remainingIds = await getDrawerLocationIds(page);
    expect(remainingIds).not.toContain(openDrawerId!);

    // The freshly switched template still opens compartments (no orphaned motion refs).
    await resetCamera(page);
    const freshId = remainingIds[Math.floor(remainingIds.length / 2)]!;
    await clickDrawer(page, freshId);
    const reopened = await waitForDrawerPhase(page, freshId, "open");
    expect(reopened.offsetMeters).toBeGreaterThan(0.01);
  });
});
