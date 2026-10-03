import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import * as crypto from "crypto";

const DB_CONN =
  process.env.DATABASE_URL ||
  "postgresql://ananya:dTd1Ii43r9Q9@localhost:5432/ananya";
const ADMIN_USER_ID = "e941c06c-f461-4cac-88ed-d2197617d06b"; // admin@48studios.in

test.describe.configure({ mode: "serial" });

test.describe("Phase 3.3: Inventory Builder Persistence & Concurrency E2E Audit", () => {
  let pool: Pool;
  let sessionToken: string;
  let testParentId: string;
  let testParentCode: string;
  let testChildAId: string;
  let testChildACode: string;
  let testChildBId: string;
  let testChildBCode: string;

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: DB_CONN });

    // 1. Provision test authentication session
    sessionToken = `test-builder-auth-${crypto.randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      "INSERT INTO user_sessions (user_id, token, ip_address, user_agent, device_info, expires_at) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        ADMIN_USER_ID,
        sessionToken,
        "127.0.0.1",
        "playwright-builder-e2e",
        "Headless Chromium",
        expiresAt,
      ],
    );

    // 2. Provision isolated container hierarchy
    const runSuffix = crypto.randomBytes(3).toString("hex");
    testParentId = crypto.randomUUID();
    testParentCode = `E2E-CAB-${runSuffix}`;
    testChildAId = crypto.randomUUID();
    testChildACode = `E2E-DRW-A-${runSuffix}`;
    testChildBId = crypto.randomUUID();
    testChildBCode = `E2E-DRW-B-${runSuffix}`;

    await pool.query(
      "INSERT INTO locations (id, code, name, kind, parent_id, is_active) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        testParentId,
        testParentCode,
        `E2E Cabinet ${runSuffix}`,
        "cabinet",
        null,
        true,
      ],
    );

    await pool.query(
      "INSERT INTO locations (id, code, name, kind, parent_id, is_active) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        testChildAId,
        testChildACode,
        `E2E Drawer A ${runSuffix}`,
        "drawer",
        testParentId,
        true,
      ],
    );

    await pool.query(
      "INSERT INTO locations (id, code, name, kind, parent_id, is_active) VALUES ($1, $2, $3, $4, $5, $6);",
      [
        testChildBId,
        testChildBCode,
        `E2E Drawer B ${runSuffix}`,
        "drawer",
        testParentId,
        true,
      ],
    );
  });

  test.afterAll(async () => {
    if (pool) {
      // Clean up layout revisions, mappings, and layouts
      await pool.query(
        "DELETE FROM spatial_layout_revisions WHERE layout_id IN (SELECT id FROM spatial_layouts WHERE parent_location_id = $1);",
        [testParentId],
      );
      await pool.query(
        "DELETE FROM spatial_layout_mappings WHERE layout_id IN (SELECT id FROM spatial_layouts WHERE parent_location_id = $1);",
        [testParentId],
      );
      await pool.query(
        "DELETE FROM spatial_layouts WHERE parent_location_id = $1;",
        [testParentId],
      );

      // Clean up locations
      await pool.query("DELETE FROM locations WHERE id IN ($1, $2);", [
        testChildAId,
        testChildBId,
      ]);
      await pool.query("DELETE FROM locations WHERE id = $1;", [testParentId]);

      // Clean up user session
      await pool.query(
        "DELETE FROM user_sessions WHERE user_agent = 'playwright-builder-e2e';",
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

  // --------------------------------------------------------------------------
  // Scenario 1: Create a draft, configure template, map locations, save, reload
  // --------------------------------------------------------------------------
  test("1. Create a draft, configure template, map locations, save, reload, and verify state restored", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${testParentId}`);

    // Wait for the workspace to finish loading
    await expect(page.getByText("Inventory Builder")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save as Draft" })).toBeVisible();

    // Verify initial clean state with 0 mapped
    await expect(page.getByText("Mapped: 0 /")).toBeVisible();

    // Configure the template geometry (must survive the persistence round-trip)
    const widthInput = page.getByLabel("Width");
    await expect(widthInput).toBeVisible();
    await widthInput.fill("720");
    await expect(page.getByText(/720 × 900 × 300 mm/)).toBeVisible();

    // Switch to Map tab
    await page.getByRole("button", { name: "2. Map" }).click();

    // Map first child location to slot
    const mapSelectTrigger = page.locator("button").filter({ hasText: "Map to slot..." }).first();
    await expect(mapSelectTrigger).toBeVisible();
    await mapSelectTrigger.click();

    // Select Slot A01 from dropdown
    const slotA01Option = page.getByRole("option", { name: /Slot A01/i });
    await expect(slotA01Option).toBeVisible();
    await slotA01Option.click();

    // Verify mapping counter is updated and unsaved edits indicator appears
    await expect(page.getByText("Mapped: 1 /")).toBeVisible();
    await expect(page.getByText("Unsaved Edits")).toBeVisible();

    // Click Save as Draft
    await page.getByRole("button", { name: "Save as Draft" }).click();

    // Fill in Layout Code and Name using accessible labels
    const codeInput = page.getByLabel("Layout Code *");
    await expect(codeInput).toBeVisible();
    await codeInput.fill(`LAYOUT-${testParentCode}`);

    const nameInput = page.getByLabel("Layout Name *");
    await nameInput.fill("Automated E2E Layout Draft");

    // Submit dialog
    await page.getByRole("button", { name: "Create Draft" }).click();

    // Notification confirms save
    await expect(
      page.getByText(/Layout draft .* created successfully/i),
    ).toBeVisible();

    // Status badge and revision display
    await expect(page.getByText("Revision: 1")).toBeVisible();
    await expect(page.locator("h1").getByText("DRAFT")).toBeVisible();
    await expect(page.getByText("Unsaved Edits")).not.toBeVisible();

    // Reload the page and verify state is fully restored
    await page.reload();
    await expect(page.getByText("Revision: 1")).toBeVisible();
    await expect(page.getByText("Mapped: 1 /")).toBeVisible();
    await expect(page.locator("h1").getByText("DRAFT")).toBeVisible();

    // The persisted template configuration is restored (720 mm, not the 600 mm default)
    await expect(page.getByText(/720 × 900 × 300 mm/)).toBeVisible();

    // The persisted slot-to-location mapping is restored to the same physical location
    await expect(page.getByText(`Code: ${testChildACode}`).first()).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Update a saved draft, save again, verify revision numbers
  // --------------------------------------------------------------------------
  test("2. Update a saved draft, save again, and verify revision numbers and change descriptions", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${testParentId}`);
    await expect(page.getByText("Revision: 1")).toBeVisible();

    // Switch to Map tab and map second drawer
    await page.getByRole("button", { name: "2. Map" }).click();

    const mapSelectTrigger = page.locator("button").filter({ hasText: "Map to slot..." }).first();
    await expect(mapSelectTrigger).toBeVisible();
    await mapSelectTrigger.click();

    const slotA02Option = page.getByRole("option", { name: /Slot A02/i });
    await expect(slotA02Option).toBeVisible();
    await slotA02Option.click();

    // Verify 2 slots mapped and dirty indicator
    await expect(page.getByText("Mapped: 2 /")).toBeVisible();
    await expect(page.getByText("Unsaved Edits")).toBeVisible();

    // Click Save Draft on toolbar
    await page.getByRole("button", { name: "Save Draft" }).click();

    // Provide change description
    const changeDescInput = page.getByLabel("Revision Change Note");
    await expect(changeDescInput).toBeVisible();
    await changeDescInput.fill("Added second drawer mapping to slot A02");

    // Submit dialog with "Save Changes"
    await page.getByRole("button", { name: "Save Changes" }).click();

    // Confirm revision is bumped to 2
    await expect(
      page.getByText(/Layout draft updated \(Revision 2\)/i),
    ).toBeVisible();
    await expect(page.getByText("Revision: 2")).toBeVisible();
    await expect(page.getByText("Unsaved Edits")).not.toBeVisible();

    // The change description was persisted into the immutable revision timeline
    await page.locator('button[title="View revision audit timeline"]').click();
    await expect(page.getByText(/Revision Audit History/)).toBeVisible();
    await expect(
      page.getByText("Added second drawer mapping to slot A02"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close" }).last().click();
    await expect(page.getByText(/Revision Audit History/)).not.toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Multi-Session Concurrency & HTTP 409 Conflict Handling
  // --------------------------------------------------------------------------
  test("3. Concurrency conflict in two browser sessions prevents silent overwrite", async ({
    browser,
  }) => {
    // Session A
    const contextA = await browser.newContext();
    await contextA.addCookies([
      {
        name: "ananya_auth_token",
        value: sessionToken,
        domain: "localhost",
        path: "/",
      },
    ]);
    const pageA = await contextA.newPage();
    await pageA.goto(`/spatial/builder?location=${testParentId}`);
    await expect(pageA.getByText("Revision: 2")).toBeVisible();

    // Session B
    const contextB = await browser.newContext();
    await contextB.addCookies([
      {
        name: "ananya_auth_token",
        value: sessionToken,
        domain: "localhost",
        path: "/",
      },
    ]);
    const pageB = await contextB.newPage();
    await pageB.goto(`/spatial/builder?location=${testParentId}`);
    await expect(pageB.getByText("Revision: 2")).toBeVisible();

    // In Session A: Make a change and save -> bumps to Revision 3
    await pageA.getByRole("button", { name: "Save Draft" }).click();
    const descA = pageA.getByLabel("Description");
    await descA.fill("Updated description by Session A");
    await pageA.getByRole("button", { name: "Save Changes" }).click();
    await expect(pageA.getByText("Revision: 3")).toBeVisible();

    // In Session B: make a workspace-level change (template width 600 -> 640) while stale
    const widthInputB = pageB.getByLabel("Width");
    await expect(widthInputB).toBeVisible();
    await widthInputB.fill("640");
    await expect(pageB.getByText(/640 × 900 × 300 mm/)).toBeVisible();
    await expect(pageB.getByText("Unsaved Edits")).toBeVisible();

    // Attempt to save with the now-stale expectedRevision = 2
    await pageB.getByRole("button", { name: "Save Draft" }).click();
    const descB = pageB.getByLabel("Description");
    await descB.fill("Conflicting description by Session B");
    await pageB.getByRole("button", { name: "Save Changes" }).click();

    // Verify Conflict Dialog opens with HTTP 409 REVISION_CONFLICT
    await expect(
      pageB.getByText("Concurrent Revision Conflict"),
    ).toBeVisible();
    await expect(pageB.getByText(/Your changes are based on revision/i)).toBeVisible();
    await expect(pageB.getByText(/layout is currently at revision/i)).toBeVisible();

    // Session B's local workspace edits are NOT silently discarded while the conflict is open
    await expect(pageB.getByText(/640 × 900 × 300 mm/)).toBeVisible();
    await expect(pageB.getByText("Unsaved Edits")).toBeVisible();

    // The stale save was rejected: the server still holds Session A's revision 3
    const revisionDuringConflict = await pool.query(
      "SELECT revision, config FROM spatial_layouts WHERE parent_location_id = $1;",
      [testParentId],
    );
    expect(revisionDuringConflict.rows[0].revision).toBe(3);
    expect(revisionDuringConflict.rows[0].config.dimensions.widthMm).toBe(720);

    // Click "Reload Server Version" to explicitly discard the stale local edit
    await pageB.getByRole("button", { name: "Reload Server Version" }).click();

    // Confirm Session B updated cleanly to Revision 3 without dirty indicator
    await expect(pageB.getByText("Revision: 3")).toBeVisible();
    await expect(pageB.getByText("Unsaved Edits")).not.toBeVisible();
    await expect(pageB.getByText(/720 × 900 × 300 mm/)).toBeVisible();
    await expect(pageB.getByText("Mapped: 2 /")).toBeVisible();

    // The layout switcher was refreshed so its revision label matches the server state
    await expect(
      pageB.locator('button[title="Select spatial layout"]'),
    ).toContainText("Rev 3");

    await contextA.close();
    await contextB.close();
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Publish a layout & handle concurrent publication conflict
  // --------------------------------------------------------------------------
  test("4. Publish a layout and verify conflict when another layout is published for parent", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${testParentId}`);
    await expect(page.getByText("Revision: 3")).toBeVisible();

    // Click Publish
    await page.getByRole("button", { name: "Publish", exact: true }).click();

    // Confirm dialog
    await expect(page.getByText("Publish Spatial Layout")).toBeVisible();
    await page.getByRole("button", { name: "Publish Layout" }).click();

    // Notification confirms publication
    await expect(
      page.getByText(/published successfully/i),
    ).toBeVisible();
    await expect(page.locator("h1").getByText("PUBLISHED")).toBeVisible();

    // Verify in database that status is PUBLISHED
    const dbRes = await pool.query(
      "SELECT status, revision FROM spatial_layouts WHERE parent_location_id = $1;",
      [testParentId],
    );
    expect(dbRes.rows[0].status).toBe("PUBLISHED");

    // Published status survives a full page reload
    await page.reload();
    await expect(page.locator("h1").getByText("PUBLISHED")).toBeVisible();

    // A PUBLISHED layout is never deletable — only never-published drafts are
    await expect(
      page.getByRole("button", { name: "Delete un-published draft" }),
    ).not.toBeVisible();

    // Exactly one PUBLISHED layout exists for this container
    const publishedCount = await pool.query(
      "SELECT count(*)::int AS count FROM spatial_layouts WHERE parent_location_id = $1 AND status = 'PUBLISHED';",
      [testParentId],
    );
    expect(publishedCount.rows[0].count).toBe(1);

    // Now start a second layout draft for the same parent container
    await page.getByRole("button", { name: "New Draft" }).click();
    await page.getByRole("button", { name: "2. Map" }).click();

    // Map a slot
    const mapSelectTrigger = page.locator("button").filter({ hasText: "Map to slot..." }).first();
    await mapSelectTrigger.click();
    await page.getByRole("option", { name: /Slot A01/i }).click();

    // Save as second draft
    await page.getByRole("button", { name: "Save as Draft" }).click();
    await page.getByLabel("Layout Code *").fill(`LAYOUT-SECOND-${testParentCode}`);
    await page.getByLabel("Layout Name *").fill("Second Layout Draft for Same Parent");
    await page.getByRole("button", { name: "Create Draft" }).click();
    await expect(page.getByText(/created successfully/i)).toBeVisible();

    // Attempt to publish second draft -> must conflict with existing published layout!
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("button", { name: "Publish Layout" }).click();

    // Verify typed conflict dialog: PUBLISHED_LAYOUT_ALREADY_EXISTS
    await expect(
      page.getByText("Only one layout can be PUBLISHED per parent container"),
    ).toBeVisible();
    await expect(page.getByText(`LAYOUT-${testParentCode}`).first()).toBeVisible();

    // The failed publication changed nothing: the second layout is still a DRAFT
    const secondDraftRes = await pool.query(
      "SELECT status FROM spatial_layouts WHERE parent_location_id = $1 AND code = $2;",
      [testParentId, `LAYOUT-SECOND-${testParentCode.toUpperCase()}`],
    );
    expect(secondDraftRes.rows[0].status).toBe("DRAFT");
    const publishedCountAfterConflict = await pool.query(
      "SELECT count(*)::int AS count FROM spatial_layouts WHERE parent_location_id = $1 AND status = 'PUBLISHED';",
      [testParentId],
    );
    expect(publishedCountAfterConflict.rows[0].count).toBe(1);

    // Close conflict dialog
    await page.getByRole("button", { name: "Close" }).last().click();
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Archive a published layout and verify archived state & history
  // --------------------------------------------------------------------------
  test("5. Archive a published layout and verify archived state and available actions", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${testParentId}`);

    // Ensure the published layout is loaded
    const layoutSelector = page.locator('button[title="Select spatial layout"]');
    if (!(await page.locator("h1").getByText("PUBLISHED").isVisible())) {
      await layoutSelector.click();
      const publishedOption = page.getByRole("option", { name: /PUBLISHED/i });
      await expect(publishedOption).toBeVisible();
      await publishedOption.click();
    }

    // Verify published layout is loaded
    await expect(page.locator("h1").getByText("PUBLISHED")).toBeVisible();

    // Click Archive
    await page.getByRole("button", { name: "Archive", exact: true }).click();

    // Confirmation dialog
    await expect(page.getByText("Archive Spatial Layout")).toBeVisible();
    await page.getByRole("button", { name: "Archive Layout" }).click();

    // Notification confirms archive
    await expect(page.getByText(/archived\. Spatial nodes/i)).toBeVisible();
    await expect(page.locator("h1").getByText("ARCHIVED")).toBeVisible();

    // Verify that Publish and Archive buttons are no longer present for ARCHIVED layout
    await expect(page.getByRole("button", { name: "Publish", exact: true })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Archive", exact: true })).not.toBeVisible();

    // Verify database record
    const dbRes = await pool.query(
      "SELECT id, status FROM spatial_layouts WHERE parent_location_id = $1 AND status = 'ARCHIVED';",
      [testParentId],
    );
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].status).toBe("ARCHIVED");

    // Archived layout history is preserved (immutable revision snapshots remain)
    const revisionRes = await pool.query(
      "SELECT count(*)::int AS count FROM spatial_layout_revisions WHERE layout_id = $1;",
      [dbRes.rows[0].id],
    );
    expect(revisionRes.rows[0].count).toBeGreaterThan(0);

    // Draft deletion is unavailable for an archived (previously published) layout
    await expect(
      page.getByRole("button", { name: "Delete un-published draft" }),
    ).not.toBeVisible();

    // History remains an available action for the archived layout
    await expect(
      page.locator('button[title="View revision audit timeline"]'),
    ).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Draft deletion is available only for un-published drafts
  // --------------------------------------------------------------------------
  test("6. Draft deletion is available only for eligible never-published drafts", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${testParentId}`);

    // Select the second draft layout
    const selectTrigger = page.locator('button[title="Select spatial layout"]');
    await selectTrigger.click();

    const secondDraftOption = page.getByRole("option", { name: /Second Layout Draft/i });
    await expect(secondDraftOption).toBeVisible();
    await secondDraftOption.click();

    // Verify it is DRAFT and has delete button
    await expect(page.locator("h1").getByText("DRAFT")).toBeVisible();
    const deleteBtn = page.getByRole("button", { name: "Delete un-published draft" });
    await expect(deleteBtn).toBeVisible();

    // Click delete
    await deleteBtn.click();
    await expect(page.getByRole("heading", { name: "Delete Draft Layout" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Draft" }).click();

    // Notification confirms deletion
    await expect(page.getByText("Draft layout deleted successfully.")).toBeVisible();

    // The never-published draft was hard-deleted; only the archived layout remains
    const deletedRes = await pool.query(
      "SELECT id FROM spatial_layouts WHERE code = $1;",
      [`LAYOUT-SECOND-${testParentCode.toUpperCase()}`],
    );
    expect(deletedRes.rows.length).toBe(0);
    const remainingRes = await pool.query(
      "SELECT id, status FROM spatial_layouts WHERE parent_location_id = $1;",
      [testParentId],
    );
    expect(remainingRes.rows.length).toBe(1);
    expect(remainingRes.rows[0].status).toBe("ARCHIVED");

    // Switch to the archived layout and verify delete button is NOT available
    await selectTrigger.click();
    const archivedOption = page.getByRole("option", { name: /ARCHIVED/i });
    await expect(archivedOption).toBeVisible();
    await archivedOption.click();
    await expect(page.locator("h1").getByText("ARCHIVED")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete un-published draft" }),
    ).not.toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Geometry change and diff detection with stale acknowledgment
  // --------------------------------------------------------------------------
  test("7. Change template geometry after acknowledging stale mappings and verify acknowledgment lifecycle", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${testParentId}`);
    await expect(page.getByText("Loading layouts...")).not.toBeVisible();

    // Switch to clean new draft
    const layoutSelector = page.locator('button[title="Select spatial layout"]');
    await layoutSelector.click();
    await page.getByRole("option", { name: /\+ New Layout Draft/i }).click();

    // Map slot A01
    await page.getByRole("button", { name: "2. Map" }).click();
    const mapSelectTrigger = page.locator("button").filter({ hasText: "Map to slot..." }).first();
    await expect(mapSelectTrigger).toBeVisible();
    await mapSelectTrigger.click();
    await page.getByRole("option", { name: /Slot A01/i }).click();

    // Switch to Build tab and commit baseline
    await page.getByRole("button", { name: "1. Build" }).click();
    const setBaselineBtn = page.getByRole("button", { name: /Set As Baseline|Commit Baseline/i });
    await expect(setBaselineBtn).toBeVisible();
    await setBaselineBtn.click();

    // Trigger stale mapping by inverting row ordering
    const rowOrderTrigger = page.locator("button").filter({ hasText: /Top-to-Bottom/i });
    await rowOrderTrigger.click();
    await page.getByRole("option", { name: /Bottom-to-Top/i }).click();

    // Verify slot A01 is marked stale in 2D preview and click it to inspect
    const slotA01Btn = page.locator("button").filter({ hasText: "Stale" });
    await expect(slotA01Btn).toBeVisible();
    await slotA01Btn.click();

    // Confirm & Keep Association in Compartment Inspector
    const confirmBtn = page.getByRole("button", { name: "Confirm & Keep Association" });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Stale indicator on slot A01 is now cleared
    await expect(page.locator("button").filter({ hasText: "Stale" })).not.toBeVisible();
    await expect(page.getByText("Physical Meaning Changed")).not.toBeVisible();

    // Perform an unrelated geometric change: outer width 600 -> 750
    const widthInput = page.getByLabel("Width");
    await widthInput.fill("750");

    // Verify slot A01 preserves acknowledgment and remains valid (not stale)
    await expect(page.locator("button").filter({ hasText: "Stale" })).not.toBeVisible();
    await expect(page.getByText("Physical Meaning Changed")).not.toBeVisible();

    // Persist the acknowledged state and reload: acknowledgment survives the round-trip
    await page.getByRole("button", { name: "Save as Draft" }).click();
    await page.getByLabel("Layout Code *").fill(`LAYOUT-ACK-${testParentCode}`);
    await page.getByLabel("Layout Name *").fill("Acknowledged Mapping Layout");
    await page.getByRole("button", { name: "Create Draft" }).click();
    await expect(page.getByText(/created successfully/i)).toBeVisible();
    await expect(page.getByText("Revision: 1")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Revision: 1")).toBeVisible();
    await expect(page.getByText(/750 × 900 × 300 mm/)).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Stale" })).not.toBeVisible();
    await expect(page.getByText("Physical Meaning Changed")).not.toBeVisible();

    // Now perform a meaning-changing edit: switch naming pattern to Row-Col
    const patternTrigger = page.locator("button").filter({ hasText: /Alphanumeric/i });
    await patternTrigger.click();
    await page.getByRole("option", { name: /Row-Col/i }).click();

    // Meaning change invalidates prior acknowledgment!
    const updatedSlotBtn = page.locator("button").filter({ hasText: "Stale" });
    await expect(updatedSlotBtn).toBeVisible();
    await updatedSlotBtn.click();
    await expect(page.getByText("Physical Meaning Changed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm & Keep Association" })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Unsaved-change protection
  // --------------------------------------------------------------------------
  test("8. Unsaved-change protection guards against accidental layout switching", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${testParentId}`);
    await expect(page.getByText("Loading layouts...")).not.toBeVisible();

    // Switch to clean new draft
    const layoutSelector = page.locator('button[title="Select spatial layout"]');
    await layoutSelector.click();
    await page.getByRole("option", { name: /\+ New Layout Draft/i }).click();

    // Map a slot to make workspace dirty
    await page.getByRole("button", { name: "2. Map" }).click();
    const mapSelectTrigger = page.locator("button").filter({ hasText: "Map to slot..." }).first();
    await mapSelectTrigger.click();
    await page.getByRole("option", { name: /Slot A01/i }).click();
    await expect(page.getByText("Unsaved Edits")).toBeVisible();

    // Attempt to switch to the ARCHIVED layout while dirty
    await layoutSelector.click();
    const archivedLayoutOption = page.getByRole("option", { name: /ARCHIVED/i });
    await expect(archivedLayoutOption).toBeVisible();
    await archivedLayoutOption.click();

    // Confirm dialog appears; "Keep Editing" preserves the dirty workspace
    await expect(page.getByText("Discard Unsaved Changes?")).toBeVisible();
    await page.getByRole("button", { name: "Keep Editing" }).click();
    await expect(page.getByText("Unsaved Edits")).toBeVisible();
    await expect(
      page.locator('button[title="Select spatial layout"]'),
    ).toContainText("New Layout Draft");

    // Attempt to create a new draft from the switcher while dirty
    await layoutSelector.click();
    await page.getByRole("option", { name: /\+ New Layout Draft/i }).click();
    await expect(page.getByText("Discard Unsaved Changes?")).toBeVisible();
    await page.getByRole("button", { name: "Discard & Switch" }).click();
    await expect(page.getByText("Unsaved Edits")).not.toBeVisible();

    // Hard navigation away is guarded by the browser beforeunload prompt while dirty
    const guardPage = await page.context().newPage();
    await guardPage.goto(`/spatial/builder?location=${testParentId}`);
    // Start from a clean new draft so a slot is guaranteed available
    const guardLayoutSelector = guardPage.locator(
      'button[title="Select spatial layout"]',
    );
    await expect(guardLayoutSelector).toBeVisible();
    await guardLayoutSelector.click();
    await guardPage.getByRole("option", { name: /\+ New Layout Draft/i }).click();
    await guardPage.getByRole("button", { name: "2. Map" }).click();
    const guardMapTrigger = guardPage
      .locator("button")
      .filter({ hasText: "Map to slot..." })
      .first();
    await guardMapTrigger.click();
    await guardPage.getByRole("option", { name: /Slot A01/i }).click();
    await expect(guardPage.getByText("Unsaved Edits")).toBeVisible();

    const beforeUnloadFired = new Promise<boolean>((resolve) => {
      guardPage.on("dialog", async (dialog) => {
        if (dialog.type() === "beforeunload") {
          await dialog.dismiss();
          resolve(true);
        } else {
          await dialog.dismiss();
        }
      });
    });
    await guardPage.close({ runBeforeUnload: true });
    const guarded = await Promise.race([
      beforeUnloadFired,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
    ]);
    expect(guarded).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Failed network requests and retry behavior
  // --------------------------------------------------------------------------
  test("9. Simulated network failure shows actionable error state and retry succeeds", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${testParentId}`);
    // Wait for layout switcher to be visible
    await expect(page.locator('button[title="Select spatial layout"]')).toBeVisible();

    // Start a new draft
    const newDraftBtn = page.locator('button[title="Start a new layout draft"]');
    await expect(newDraftBtn).toBeVisible();
    await newDraftBtn.click();
    await expect(page.getByRole("button", { name: "Save as Draft", exact: true })).toBeVisible();

    // Map a slot
    await page.getByRole("button", { name: "2. Map" }).click();
    const mapSelectTrigger = page.locator("button").filter({ hasText: "Map to slot..." }).first();
    await mapSelectTrigger.click();
    await page.getByRole("option", { name: /Slot A01/i }).click();

    // Intercept POST /spatial/layouts once to simulate server error
    let failureTriggered = false;
    await page.route("**/spatial/layouts", async (route) => {
      if (route.request().method() === "POST" && !failureTriggered) {
        failureTriggered = true;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 500,
            message: "Simulated transient network outage",
          }),
        });
      } else {
        await route.continue();
      }
    });

    const uniqueCode = `LAYOUT-FAILOVER-${Date.now().toString(36).toUpperCase()}`;

    // Try saving draft
    await page.getByRole("button", { name: "Save as Draft" }).click();
    await page.getByLabel("Layout Code *").fill(uniqueCode);
    await page.getByLabel("Layout Name *").fill("Failover Test Draft");
    await page.getByRole("button", { name: "Create Draft" }).click();

    // Error message displays inside dialog and the loading indicator has cleared
    await expect(
      page.getByText(/Simulated transient network outage|Failed to save layout/i),
    ).toBeVisible();
    const retryBtn = page.getByRole("button", { name: "Create Draft" });
    await expect(retryBtn).toBeEnabled();
    await expect(page.getByLabel("Layout Code *")).toHaveValue(uniqueCode);

    // Click "Create Draft" to retry now that the transient failure route has passed
    await retryBtn.click();

    // Verify retry succeeds
    await expect(page.getByText(/created successfully/i)).toBeVisible();
    await expect(page.getByText("Revision: 1")).toBeVisible();

    // Verify in database that only ONE layout record (and no duplicate revision) exists with this code
    const dbRes = await pool.query(
      "SELECT id FROM spatial_layouts WHERE code = $1;",
      [uniqueCode],
    );
    expect(dbRes.rows.length).toBe(1);
    const revRes = await pool.query(
      "SELECT count(*)::int AS count FROM spatial_layout_revisions WHERE layout_id = $1;",
      [dbRes.rows[0].id],
    );
    expect(revRes.rows[0].count).toBeLessThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Revision history inspection does not mutate current workspace
  // --------------------------------------------------------------------------
  test("10. Revision history inspection displays immutable timeline without mutating workspace", async ({
    page,
  }) => {
    await page.goto(`/spatial/builder?location=${testParentId}`);
    await expect(page.getByText("Loading layouts...")).not.toBeVisible();

    // Ensure the archived layout is selected
    const archivedStatus = page.locator("h1").getByText("ARCHIVED");
    if (!(await archivedStatus.isVisible())) {
      const selectTrigger = page.locator('button[title="Select spatial layout"]');
      await selectTrigger.click();
      const archivedOption = page.getByRole("option", { name: /ARCHIVED/i });
      await expect(archivedOption).toBeVisible();
      await archivedOption.click();
    }
    await expect(archivedStatus).toBeVisible();

    const archivedLayoutId = (
      await pool.query(
        "SELECT id FROM spatial_layouts WHERE parent_location_id = $1 AND status = 'ARCHIVED';",
        [testParentId],
      )
    ).rows[0].id as string;

    // Capture the workspace revision display and database revision before inspection
    const workspaceRevisionBefore = await page
      .getByText(/Revision: \d+/)
      .first()
      .textContent();
    const dbRevisionBefore = await pool.query(
      "SELECT revision, updated_at FROM spatial_layouts WHERE id = $1;",
      [archivedLayoutId],
    );

    // Open History dialog
    const historyBtn = page.locator('button[title="View revision audit timeline"]');
    await expect(historyBtn).toBeVisible();
    await historyBtn.click();

    // Verify the immutable revision audit timeline opened with its checkpoints
    await expect(page.getByText(/Revision Audit History/)).toBeVisible();
    await expect(page.getByText("Revision #1")).toBeVisible();
    await expect(page.getByText("Revision #4")).toBeVisible();

    // Inspect a historical snapshot in place
    await page.getByRole("button", { name: "Inspect Snapshot" }).first().click();
    await expect(page.getByText(/Snapshot Mappings/)).toBeVisible();
    await expect(
      page.getByText(`Location: ${testChildACode}`).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Hide Snapshot" }).first().click();

    // Close history dialog
    await page.getByRole("button", { name: "Close" }).last().click();

    // Inspection is read-only: the workspace state is untouched
    await expect(archivedStatus).toBeVisible();
    await expect(page.getByText(/Revision: \d+/).first()).toHaveText(
      workspaceRevisionBefore ?? "",
    );

    // ...and no database mutation occurred (revision counter and updated_at unchanged)
    const dbRevisionAfter = await pool.query(
      "SELECT revision, updated_at FROM spatial_layouts WHERE id = $1;",
      [archivedLayoutId],
    );
    expect(dbRevisionAfter.rows[0].revision).toBe(
      dbRevisionBefore.rows[0].revision,
    );
    expect(new Date(dbRevisionAfter.rows[0].updated_at).toISOString()).toBe(
      new Date(dbRevisionBefore.rows[0].updated_at).toISOString(),
    );
  });
});
