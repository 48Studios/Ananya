import { describe, expect, it } from "vitest";
import {
  evaluateBackfillGuard,
  planPhysicalContainerBackfill,
  type ApprovedBackfillCounts,
  type BackfillLocationInput,
} from "./physical-containment-backfill";

/**
 * RFC-0069 Phase 3A — read-only backfill preview planner.
 *
 * These tests exercise the pure planning logic with plain data. No database is
 * touched; the tool that wires this to the DB is read-only and tested separately.
 */

const loc = (
  id: string,
  code: string,
  kind: string,
  parentId: string | null = null,
  extra: Partial<BackfillLocationInput> = {},
): BackfillLocationInput => ({
  id,
  code,
  kind,
  parentId,
  containerId: null,
  isActive: true,
  ...extra,
});

describe("planPhysicalContainerBackfill", () => {
  it("proposes the parent as container for a canonical relationship", () => {
    const plan = planPhysicalContainerBackfill([
      loc("cab", "CAB", "cabinet"),
      loc("drw", "DRW", "drawer", "cab"),
    ]);

    const proposal = plan.proposals.find((p) => p.childId === "drw");
    expect(proposal?.classification).toBe("canonical");
    expect(proposal?.proposedContainerId).toBe("cab");
    expect(proposal?.proposedContainerCategory).toBe("cabinet");
    expect(plan.summary.canonical).toEqual({ count: 1, proposed: 1 });
    expect(plan.validation.safe).toBe(true);
  });

  it("proposes the parent as container for a context-root relationship", () => {
    const plan = planPhysicalContainerBackfill([
      loc("wh", "WH", "warehouse"),
      loc("rack", "RACK", "rack", "wh"),
    ]);

    const proposal = plan.proposals.find((p) => p.childId === "rack");
    expect(proposal?.classification).toBe("context-root");
    expect(proposal?.proposedContainerId).toBe("wh");
    expect(plan.summary.contextRoot).toEqual({ count: 1, proposed: 1 });
    expect(plan.validation.safe).toBe(true);
  });

  it("proposes the parent as container for a legacy-compatible relationship (tray → bin)", () => {
    const plan = planPhysicalContainerBackfill([
      loc("tray", "TRAY", "tray"),
      loc("bin", "BIN", "bin", "tray"),
    ]);

    const proposal = plan.proposals.find((p) => p.childId === "bin");
    expect(proposal?.classification).toBe("legacy-compatible");
    expect(proposal?.proposedContainerId).toBe("tray");
    expect(plan.summary.legacyCompatible).toEqual({ count: 1, proposed: 1 });
    expect(plan.validation.safe).toBe(true);
  });

  it("proposes NULL for a violation (cabinet → bin)", () => {
    const plan = planPhysicalContainerBackfill([
      loc("cab", "CAB", "cabinet"),
      loc("bin", "BIN", "bin", "cab"),
    ]);

    const proposal = plan.proposals.find((p) => p.childId === "bin");
    expect(proposal?.classification).toBe("violation");
    expect(proposal?.proposedContainerId).toBeNull();
    expect(proposal?.proposedContainerCategory).toBeNull();
    expect(plan.summary.violations.count).toBe(1);
    expect(plan.summary.violations.proposedNull).toBe(1);
    expect(plan.summary.violations.breakdown).toEqual([
      { pair: "cabinet → bin", count: 1 },
    ]);
    // A violation must never fail the safety check — NULL is the correct answer.
    expect(plan.validation.safe).toBe(true);
  });

  it("proposes NULL for shelf → shelf", () => {
    const plan = planPhysicalContainerBackfill([
      loc("s1", "S1", "shelf"),
      loc("s2", "S2", "shelf", "s1"),
    ]);
    expect(plan.proposals.find((p) => p.childId === "s2")?.proposedContainerId).toBeNull();
    expect(plan.summary.violations.breakdown).toEqual([
      { pair: "shelf → shelf", count: 1 },
    ]);
  });

  it("proposes NULL for an unparented location and never infers a container", () => {
    const plan = planPhysicalContainerBackfill([
      loc("cab", "CAB", "cabinet"), // unparented physical root
      loc("wh", "WH", "warehouse"),
    ]);

    expect(plan.proposals).toHaveLength(0);
    expect(plan.summary.unparented).toBe(2);
    expect(plan.summary.proposedAssignments).toBe(0);
    // Unparented cabinets do NOT get a facility owner.
    expect(plan.summary.unchangedNull).toBe(2);
    expect(plan.validation.safe).toBe(true);
  });

  it("counts already-populated containerIds without changing its proposal logic", () => {
    const plan = planPhysicalContainerBackfill([
      loc("cab", "CAB", "cabinet"),
      loc("drw", "DRW", "drawer", "cab", { containerId: "cab" }),
    ]);

    expect(plan.summary.alreadyPopulated).toBe(1);
    expect(plan.proposals.find((p) => p.childId === "drw")?.proposedContainerId).toBe("cab");
  });

  it("rejects an unsafe proposal when the parent cannot physically contain the child", () => {
    // A malformed row: warehouse → compartment is context-root classified by the
    // relationship classifier, but the canonical predicate rejects it. The plan
    // must FAIL rather than emit an invalid proposal.
    const plan = planPhysicalContainerBackfill([
      loc("wh", "WH", "warehouse"),
      loc("cmp", "CMP", "compartment", "wh"),
    ]);

    expect(plan.validation.safe).toBe(false);
    expect(plan.validation.issues.some((i) => i.code === "PREDICATE_FAILED")).toBe(
      true,
    );
  });

  it("rejects a proposal whose container is inactive", () => {
    const plan = planPhysicalContainerBackfill([
      loc("cab", "CAB", "cabinet", null, { isActive: false }),
      loc("drw", "DRW", "drawer", "cab"),
    ]);

    expect(plan.validation.safe).toBe(false);
    expect(
      plan.validation.issues.some((i) => i.code === "INACTIVE_CONTAINER"),
    ).toBe(true);
  });

  it("rejects a proposal whose container does not exist", () => {
    const plan = planPhysicalContainerBackfill([
      loc("drw", "DRW", "drawer", "missing-parent"),
    ]);

    expect(plan.validation.safe).toBe(false);
    expect(
      plan.validation.issues.some((i) => i.code === "PARENT_MISSING"),
    ).toBe(true);
  });

  it("rejects a proposed container cycle (A → B → A)", () => {
    // Both edges are canonical: rack → shelf and shelf → ...; use a context-root
    // pair that can nest in both directions: warehouse → room_area → warehouse.
    const plan = planPhysicalContainerBackfill([
      loc("wh", "WH", "warehouse", "room"),
      loc("room", "ROOM", "room_area", "wh"),
    ]);

    expect(plan.validation.safe).toBe(false);
    expect(plan.validation.issues.some((i) => i.code === "CONTAINER_CYCLE")).toBe(
      true,
    );
  });

  it("rejects a proposed self-container", () => {
    const plan = planPhysicalContainerBackfill([
      loc("self", "SELF", "cabinet", "self"),
    ]);

    expect(plan.validation.safe).toBe(false);
    expect(
      plan.validation.issues.some((i) => i.code === "SELF_CONTAINER"),
    ).toBe(true);
  });

  it("is deterministic across repeated runs on the same input", () => {
    const input: BackfillLocationInput[] = [
      loc("wh", "WH", "warehouse"),
      loc("rack", "RACK", "rack", "wh"),
      loc("shelf", "SHF", "shelf", "rack"),
      loc("cab", "CAB", "cabinet", "wh"),
      loc("bin", "BIN", "bin", "cab"),
      loc("tray", "TRAY", "tray", "wh"),
      loc("tbin", "TBIN", "bin", "tray"),
      loc("solo", "SOLO", "shelf"),
    ];

    const first = planPhysicalContainerBackfill(input);
    const second = planPhysicalContainerBackfill(input);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("produces integer, non-negative summary counts", () => {
    const plan = planPhysicalContainerBackfill([
      loc("wh", "WH", "warehouse"),
      loc("rack", "RACK", "rack", "wh"),
      loc("bin", "BIN", "bin", "rack"), // violation
    ]);

    const { summary } = plan;
    expect(summary.locationsScanned).toBe(3);
    expect(summary.relationshipsScanned).toBe(2);
    expect(summary.proposedAssignments).toBe(1);
    expect(summary.proposedNull).toBe(1);
    // unchangedNull = unparented (wh) + violations (bin → rack) = 2.
    expect(summary.unchangedNull).toBe(2);
  });

  it("builds the approved assignment set: exactly the non-null proposals", () => {
    const plan = planPhysicalContainerBackfill([
      loc("wh", "WH", "warehouse"),
      loc("rack", "RACK", "rack", "wh"), // context-root → assigned
      loc("shelf", "SHF", "shelf", "rack"), // canonical → assigned
      loc("cab", "CAB", "cabinet", "wh"), // context-root → assigned
      loc("bin", "BIN", "bin", "cab"), // violation → NOT assigned
      loc("tray", "TRAY", "tray", "wh"), // context-root → assigned
      loc("tbin", "TBIN", "bin", "tray"), // legacy-compatible → assigned
      loc("solo", "SOLO", "shelf"), // unparented → NOT assigned
    ]);

    const approved = plan.proposals.filter((p) => p.proposedContainerId !== null);
    // 5 assignments: rack, shelf, cab, tray, tbin.
    expect(approved).toHaveLength(5);
    // Every approved assignment mirrors parentId exactly.
    for (const p of approved) {
      expect(p.proposedContainerId).toBe(p.parentId);
      expect(["canonical", "context-root", "legacy-compatible"]).toContain(
        p.classification,
      );
    }
    // Violation and unparented rows are excluded from the assignment set.
    const approvedIds = new Set(approved.map((p) => p.childId));
    expect(approvedIds.has("bin")).toBe(false);
    expect(approvedIds.has("solo")).toBe(false);
    expect(plan.summary.proposedAssignments).toBe(5);
  });
});

/**
 * RFC-0069 Phase 3B — the approved-count guard. The backfill must refuse to
 * write unless the live plan reproduces the counts the Phase 3A review approved.
 */
describe("evaluateBackfillGuard", () => {
  const approved: ApprovedBackfillCounts = {
    assignments: 151,
    violations: 18,
    canonical: 132,
    contextRoot: 7,
    legacyCompatible: 12,
    unparented: 101,
  };

  const summaryWith = (overrides: Partial<ApprovedBackfillCounts>) => ({
    locationsScanned: 272,
    relationshipsScanned: 169,
    alreadyPopulated: 0,
    unparented: overrides.unparented ?? approved.unparented,
    canonical: { count: overrides.canonical ?? approved.canonical, proposed: 0 },
    contextRoot: { count: overrides.contextRoot ?? approved.contextRoot, proposed: 0 },
    legacyCompatible: {
      count: overrides.legacyCompatible ?? approved.legacyCompatible,
      proposed: 0,
    },
    violations: {
      count: overrides.violations ?? approved.violations,
      proposedNull: 0,
      breakdown: [],
    },
    proposedAssignments: overrides.assignments ?? approved.assignments,
    proposedNull: overrides.violations ?? approved.violations,
    unchangedNull: 0,
  });

  it("passes when every count matches the approval", () => {
    const result = evaluateBackfillGuard(summaryWith({}), approved);
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it("fails on an assignments mismatch", () => {
    const result = evaluateBackfillGuard(
      summaryWith({ assignments: 150 }),
      approved,
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches).toContainEqual({
      key: "assignments",
      expected: 151,
      actual: 150,
    });
  });

  it("fails on an unparented mismatch (101 approved vs 103 live)", () => {
    const result = evaluateBackfillGuard(
      summaryWith({ unparented: 103 }),
      approved,
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches).toContainEqual({
      key: "unparented",
      expected: 101,
      actual: 103,
    });
  });

  it("reports every mismatch, not just the first", () => {
    const result = evaluateBackfillGuard(
      summaryWith({ canonical: 130, violations: 20, unparented: 103 }),
      approved,
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((m) => m.key).sort()).toEqual([
      "canonical",
      "unparented",
      "violations",
    ]);
  });
});