import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Phase 3.4.6, Task 1: inactive-parent publication UX.
 *
 * The web package has no DOM test harness (no jsdom/happy-dom/testing-library),
 * so component rendering cannot be exercised in vitest. These tests pin the
 * wiring contract instead: the dialog declares the INACTIVE_LAYOUT_PARENT
 * branch with parent-preserving copy, and the workspace routes exactly that
 * error code to it without touching draft state.
 *
 * State preservation itself is structural: the INACTIVE_LAYOUT_PARENT branch
 * calls only setConflictInfo + setIsPublishConfirmOpen(false) — no setState,
 * no loadLayoutIntoWorkspace, no fetchLayouts — unlike the success path. That
 * is asserted below against the handler source.
 */
const dialogPath = path.join(
  __dirname,
  "..",
  "..",
  "components",
  "spatial",
  "builder",
  "layout-conflict-dialog.tsx",
);
const workspacePath = path.join(
  __dirname,
  "..",
  "..",
  "components",
  "spatial",
  "builder",
  "inventory-builder-workspace.tsx",
);

describe("Inactive-parent publication UX contract", () => {
  it("declares an INACTIVE_LAYOUT_PARENT conflict branch distinct from hierarchy errors", () => {
    const src = fs.readFileSync(dialogPath, "utf8");

    expect(src).toContain('type: "INACTIVE_LAYOUT_PARENT"');
    expect(src).toContain("Parent Location Inactive");
    // Actionable, parent-specific copy — not the generic hierarchy wording.
    expect(src).toContain("Reactivate the parent container to publish");
    expect(src).toContain("Storage Locations");
    // The branch must not reuse hierarchy-validation language.
    const branchStart = src.indexOf('conflict.type === "INACTIVE_LAYOUT_PARENT"');
    expect(branchStart).toBeGreaterThan(-1);
    const branchSlice = src.slice(branchStart, branchStart + 2000);
    expect(branchSlice).not.toContain("CONCURRENT_HIERARCHY_MUTATION");
    expect(branchSlice).not.toContain("INACTIVE_LOCATION_MAPPED");
  });

  it("routes the INACTIVE_LAYOUT_PARENT error code to the dialog in the publish handler", () => {
    const src = fs.readFileSync(workspacePath, "utf8");
    const publishStart = src.indexOf("handlePublishConfirm");
    expect(publishStart).toBeGreaterThan(-1);
    const handlerSlice = src.slice(publishStart, publishStart + 6000);

    // The 422 branch is matched on the error code before any generic handling.
    expect(handlerSlice).toContain('details?.error === "INACTIVE_LAYOUT_PARENT"');
    expect(handlerSlice).toContain('type: "INACTIVE_LAYOUT_PARENT"');
    // The publish confirmation closes; the dialog opens via conflictInfo.
    expect(handlerSlice).toContain("setIsPublishConfirmOpen(false)");
  });

  it("preserves draft, mappings, edits, and revision state on the inactive-parent path", () => {
    const src = fs.readFileSync(workspacePath, "utf8");
    const branchStart = src.indexOf('details?.error === "INACTIVE_LAYOUT_PARENT"');
    expect(branchStart).toBeGreaterThan(-1);
    // Bound the branch: from the match to the next error-code branch.
    const nextBranch = src.indexOf(
      'details?.error === "PUBLISHED_LAYOUT_ALREADY_EXISTS"',
      branchStart,
    );
    expect(nextBranch).toBeGreaterThan(branchStart);
    const branchSlice = src.slice(branchStart, nextBranch);

    // No state mutation, no reload, no refetch, no retry on this path.
    expect(branchSlice).not.toContain("setState");
    expect(branchSlice).not.toContain("loadLayoutIntoWorkspace");
    expect(branchSlice).not.toContain("fetchLayouts");
    expect(branchSlice).not.toContain("handlePublishConfirm(true)");
    expect(branchSlice).not.toContain("onConfirmOwnershipOverwrite");
    // Only dialog state changes.
    expect(branchSlice).toContain("setConflictInfo");
  });
});
