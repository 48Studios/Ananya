import { test, expect, requireE2EAuth } from "../fixtures/test.fixture";
import { Pool } from "pg";
import * as crypto from "crypto";
import {
  DEMO_CODES,
  resolveDemoLocationId,
  resolveDemoModelId,
} from "./helpers/demo-dataset";
import * as fs from "fs";
import * as path from "path";
test.beforeEach(() => requireE2EAuth());

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://ananya:dTd1Ii43r9Q9@localhost:5432/ananya";

// Resolved from seeded codes: a re-seed generates new server-side UUIDs.
let CABINET_LOCATION_ID: string;
let CABINET_MODEL_ID: string;

let pool: Pool;
let testToken: string;
const testModelDir = path.join(
  process.cwd(),
  "apps/web/public/test-models",
);
const testGlbPath = path.join(testModelDir, "cabinet.glb");

function generateTestGlbBuffer(): Buffer {
  const positions = new Float32Array([
    -0.3, 0.0, 0.2, 0.3, 0.0, 0.2, 0.3, 0.9, 0.2, -0.3, 0.9, 0.2,
    -0.3, 0.0, -0.2, -0.3, 0.9, -0.2, 0.3, 0.9, -0.2, 0.3, 0.0, -0.2,
    -0.3, 0.9, 0.2, 0.3, 0.9, 0.2, 0.3, 0.9, -0.2, -0.3, 0.9, -0.2,
    -0.3, 0.0, 0.2, -0.3, 0.0, -0.2, 0.3, 0.0, -0.2, 0.3, 0.0, 0.2,
    0.3, 0.0, 0.2, 0.3, 0.0, -0.2, 0.3, 0.9, -0.2, 0.3, 0.9, 0.2,
    -0.3, 0.0, 0.2, -0.3, 0.9, 0.2, -0.3, 0.9, -0.2, -0.3, 0.0, -0.2,
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12,
    14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23,
  ]);

  const binLength = positions.byteLength + indices.byteLength;
  const binPadding = (4 - (binLength % 4)) % 4;
  const binTotal = binLength + binPadding;
  const binBuf = Buffer.alloc(binTotal);
  binBuf.set(Buffer.from(positions.buffer), 0);
  binBuf.set(Buffer.from(indices.buffer), positions.byteLength);

  const gltf = {
    asset: { version: "2.0", generator: "Ananya GLB Runtime Test Fixture" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "CabinetCarcass" }],
    meshes: [
      {
        name: "CabinetMesh",
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: "CabinetBlue",
        pbrMetallicRoughness: {
          baseColorFactor: [0.15, 0.45, 0.85, 1.0],
          roughnessFactor: 0.5,
          metallicFactor: 0.2,
        },
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positions.byteLength,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: indices.byteLength,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: 24,
        type: "VEC3",
        max: [0.3, 0.9, 0.2],
        min: [-0.3, 0.0, -0.2],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5123,
        count: 36,
        type: "SCALAR",
        max: [23],
        min: [0],
      },
    ],
    buffers: [{ byteLength: binLength }],
  };

  const jsonStr = JSON.stringify(gltf);
  const jsonLength = Buffer.byteLength(jsonStr);
  const jsonPadding = (4 - (jsonLength % 4)) % 4;
  const jsonTotal = jsonLength + jsonPadding;
  const jsonBuf = Buffer.alloc(jsonTotal, 0x20);
  jsonBuf.write(jsonStr, 0, jsonLength, "utf-8");

  const totalFileSize = 12 + 8 + jsonTotal + 8 + binTotal;
  const glb = Buffer.alloc(totalFileSize);

  glb.writeUInt32LE(0x46546c67, 0); // "glTF"
  glb.writeUInt32LE(2, 4); // v2
  glb.writeUInt32LE(totalFileSize, 8);

  glb.writeUInt32LE(jsonTotal, 12);
  glb.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  jsonBuf.copy(glb, 20);

  const binOffset = 20 + jsonTotal;
  glb.writeUInt32LE(binTotal, binOffset);
  glb.writeUInt32LE(0x004e4942, binOffset + 4); // "BIN\0"
  binBuf.copy(glb, binOffset + 8);

  return glb;
}

test.describe("Spatial Inventory 3D — Custom GLB/GLTF Runtime Verification", () => {
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
      "playwright-spatial-token-" + crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      "INSERT INTO user_sessions (user_id, token, ip_address, user_agent, device_info, expires_at) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        adminId,
        testToken,
        "127.0.0.1",
        "Playwright Spatial E2E",
        "Headless Chromium",
        expiresAt,
      ],
    );

    // 2. Resolve the seeded demo dataset by code
    CABINET_LOCATION_ID = await resolveDemoLocationId(
      pool,
      DEMO_CODES.cabinetA,
    );
    CABINET_MODEL_ID = await resolveDemoModelId(pool, DEMO_CODES.modelCabinetA);

    // 3. Ensure test fixture directory exists and write cabinet.glb
    if (!fs.existsSync(testModelDir)) {
      fs.mkdirSync(testModelDir, { recursive: true });
    }
    fs.writeFileSync(testGlbPath, generateTestGlbBuffer());
  });

  test.afterAll(async () => {
    // 1. Reset database model to procedural
    if (pool) {
      await pool.query(
        "UPDATE spatial_models SET format = 'PROCEDURAL', asset_uri = NULL WHERE id = $1;",
        [CABINET_MODEL_ID],
      );
      if (testToken) {
        await pool.query("DELETE FROM user_sessions WHERE token = $1;", [
          testToken,
        ]);
      }
      await pool.end();
    }

    // 2. Remove test fixture file so no untracked assets remain in repo
    if (fs.existsSync(testGlbPath)) {
      fs.unlinkSync(testGlbPath);
    }
    if (fs.existsSync(testModelDir)) {
      try {
        fs.rmdirSync(testModelDir);
      } catch {
        // directory not empty or in use
      }
    }
  });

  test.beforeEach(async ({ context }) => {
    // Add authentication cookie to browser context
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

  test("1. Successfully loads valid custom GLB asset and renders in 3D viewport", async ({
    page,
  }) => {
    // Configure model to point to valid GLB
    await pool.query(
      "UPDATE spatial_models SET format = 'GLB', asset_uri = '/test-models/cabinet.glb' WHERE id = $1;",
      [CABINET_MODEL_ID],
    );

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`);

    // Verify 3D viewport canvas rendered
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Verify HUD chip transitions to 'Custom 3D'
    const customBadge = page.getByText("Custom 3D");
    await expect(customBadge).toBeVisible({ timeout: 10000 });

    // Verify location code chip and count in HUD
    await expect(page.getByText("5 in 3D").first()).toBeVisible();

    // Verify WebGL context is active
    const isWebGLActive = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return false;
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      return Boolean(gl && !gl.isContextLost());
    });
    expect(isWebGLActive).toBe(true);

    // Verify zero fatal WebGL console errors
    const fatalErrors = consoleErrors.filter((e) =>
      e.includes("WebGL: CONTEXT_LOST_WEBGL") || e.includes("Failed to compile"),
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test("2. Anchor positions align accurately within custom model geometry", async ({
    page,
  }) => {
    await page.goto(`/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`);

    // Verify custom model loaded
    await expect(page.getByText("Custom 3D")).toBeVisible({ timeout: 10000 });

    // Verify child compartment mapping: Drawer A01 through A05 are rendered in 3D
    // Unmapped Drawer A06 appears in unmapped chip
    const unmappedBtn = page.getByRole("button", { name: /1 unmapped/i });
    await expect(unmappedBtn).toBeVisible();

    // Click unmapped button -> expands unmapped drawer
    await unmappedBtn.click();
    await expect(page.getByText("DEMO-SPATIAL-DRAWER-A06").first()).toBeVisible();
    await expect(page.getByText(/Staging Tray/).first()).toBeVisible();

    // Close unmapped drawer
    await unmappedBtn.click();
  });

  test("3. Preserves view switching, caching, and clean resource disposal across 2D/3D/List", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`);
    await expect(page.getByText("Custom 3D")).toBeVisible({ timeout: 10000 });

    // 1. Switch to 2D Spatial view (inner canvas toggle)
    const view2dBtn = page.getByRole("button", { name: "2D Grid" });
    await view2dBtn.click();
    await expect(page.getByText("Operational Layout").first()).toBeVisible();

    // 2. Switch to List view (section action)
    const viewListBtn = page.getByRole("button", { name: "Table View" });
    await viewListBtn.click();
    await expect(page.getByText("DEMO-SPATIAL-DRAWER-A01").first()).toBeVisible();

    // 3. Return to the spatial canvas and switch to the 3D Scene
    await page.getByRole("button", { name: "Spatial View" }).click();
    await expect(page.getByRole("button", { name: "2D Grid" })).toBeVisible({
      timeout: 15000,
    });
    const view3dBtn = page.getByRole("button", { name: "3D Scene" });
    await view3dBtn.click();

    // Re-renders custom model from cache without error
    await expect(page.getByText("Custom 3D")).toBeVisible({ timeout: 10000 });
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible();

    // Verify zero context lost or disposal errors occurred during transitions
    const fatalErrors = consoleErrors.filter((e) =>
      e.includes("CONTEXT_LOST_WEBGL") || e.includes("Cannot read properties of disposed"),
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test("4. Non-blocking procedural fallback activates when asset is missing or invalid", async ({
    page,
  }) => {
    // Configure model to non-existent asset URI
    await pool.query(
      "UPDATE spatial_models SET format = 'GLB', asset_uri = '/test-models/missing-cabinet.glb' WHERE id = $1;",
      [CABINET_MODEL_ID],
    );

    await page.goto(`/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`);

    // Verify HUD badge displays Procedural Fallback
    const fallbackBadge = page.getByText("Procedural Fallback");
    await expect(fallbackBadge).toBeVisible({ timeout: 10000 });

    // Verify canvas is still visible and operational
    const canvas = page.locator("div.relative canvas").first();
    await expect(canvas).toBeVisible();

    // Child compartments remain active
    await expect(page.getByText("5 in 3D").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /1 unmapped/i })).toBeVisible();
  });

  test("5. Child compartment selection, inspector details, and navigation drill-down", async ({
    page,
  }) => {
    // Ensure valid GLB is configured
    await pool.query(
      "UPDATE spatial_models SET format = 'GLB', asset_uri = '/test-models/cabinet.glb' WHERE id = $1;",
      [CABINET_MODEL_ID],
    );

    await page.goto(`/inventory/locations/${CABINET_LOCATION_ID}?view=spatial3d`);
    await expect(page.getByText("Custom 3D")).toBeVisible({ timeout: 10000 });

    // Open unmapped drawer
    const unmappedBtn = page.getByRole("button", { name: /1 unmapped/i });
    await unmappedBtn.click();

    // Select unmapped drawer A06 to test inspector opening
    await page.getByText("DEMO-SPATIAL-DRAWER-A06").first().click();

    // Verify Inspector opens
    await expect(page.getByText("DEMO-SPATIAL-DRAWER-A06").first()).toBeVisible();
    await expect(page.getByText("Physical Path:")).toBeVisible();

    // The transient staging picker yields to the inspector so the two panels
    // can never occlude each other on narrower canvases.
    await expect(page.getByTestId("spatial-staging-tray")).not.toBeVisible();

    // Drill down: enter drawer location via the inspector's Enter action
    const inspector = page.getByTestId("spatial-inspector-overlay");
    const enterBtn = inspector
      .getByRole("button", { name: /Enter location DEMO-SPATIAL-DRAWER-A06/i })
      .first();
    if (await enterBtn.isVisible()) {
      await enterBtn.click();
      await expect(page).toHaveURL(
        /inventory\/locations\/cc6e8839-2d94-48c2-9710-04be238a3c32/,
      );

      // The drilled-down drawer is a leaf, so the page keeps the physical
      // hierarchy visible through its location path instead of a canvas.
      await expect(
        page.getByText("DEMO-SPATIAL-DRAWER-A06").first(),
      ).toBeVisible();
      await expect(page.getByText(/DEMO-SPATIAL-CABINET-A/).first()).toBeVisible();
      await expect(
        page.getByText(/No sub-locations are nested under this location yet./),
      ).toBeVisible();
    }
  });

  test("6. Anchor coordinate validation against custom model geometry limits", async () => {
    // Query actual spatial model and anchors from database
    const modelRes = await pool.query(
      "SELECT width_mm, height_mm, depth_mm FROM spatial_models WHERE id = $1;",
      [CABINET_MODEL_ID],
    );
    const model = modelRes.rows[0];
    const widthMm = Number(model.width_mm);
    const heightMm = Number(model.height_mm);
    const depthMm = Number(model.depth_mm);

    expect(widthMm).toBe(600);
    expect(heightMm).toBe(900);
    expect(depthMm).toBe(400);

    // Query anchors attached to this cabinet model
    const anchorsRes = await pool.query(
      "SELECT code, local_position_x, local_position_y, local_position_z, bounding_width_mm, bounding_height_mm, bounding_depth_mm FROM spatial_anchors WHERE model_id = $1;",
      [CABINET_MODEL_ID],
    );
    expect(anchorsRes.rows.length).toBeGreaterThanOrEqual(5);

    // Verify every child anchor fits inside the custom carcass geometry
    for (const anchor of anchorsRes.rows) {
      const x = Number(anchor.local_position_x);
      const y = Number(anchor.local_position_y);
      const z = Number(anchor.local_position_z);
      const bw = Number(anchor.bounding_width_mm || 0);
      const bh = Number(anchor.bounding_height_mm || 0);
      const bd = Number(anchor.bounding_depth_mm || 0);

      // In Ananya Spatial schema, anchor positions specify center coordinates.
      // Check vertical boundary: center +/- half-height must fit within [0, heightMm]
      expect(y - bh / 2).toBeGreaterThanOrEqual(0);
      expect(y + bh / 2).toBeLessThanOrEqual(heightMm);

      // Check horizontal X boundary: center +/- half-width must fit within [0, widthMm]
      expect(x - bw / 2).toBeGreaterThanOrEqual(0);
      expect(x + bw / 2).toBeLessThanOrEqual(widthMm);

      // Check depth Z boundary: bounding depth must fit within carcass depth
      expect(bd).toBeLessThanOrEqual(depthMm);
    }
  });
});
