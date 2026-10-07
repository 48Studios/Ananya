import { describe, expect, it } from "vitest";
import {
  verifyPhysicalContainmentIntegrity,
  type PhysicalContainmentLocation,
} from "./physical-containment-verifier";

/**
 * RFC-0069 — physical-containment integrity verifier. One focused case per
 * failure class, plus the documented legacy-pair success path.
 */

const loc = (
  id: string,
  code: string,
  kind: string,
  containerId: string | null = null,
  extra: Partial<PhysicalContainmentLocation> = {},
): PhysicalContainmentLocation => ({
  id,
  code,
  kind,
  parentId: null,
  containerId,
  isActive: true,
  ...extra,
});

const codesOf = (report: { errors: Array<{ code: string }> }) =>
  report.errors.map((e) => e.code);

describe("verifyPhysicalContainmentIntegrity", () => {
  it("passes a valid canonical graph", () => {
    const report = verifyPhysicalContainmentIntegrity([
      loc("cab", "CAB", "cabinet"),
      loc("drw", "DRW", "drawer", "cab"),
      loc("bin", "BIN", "bin", "drw"),
    ]);
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.counts.populated).toBe(2);
    expect(report.counts.maxContainerDepth).toBe(2);
  });

  it("passes a context-root relationship (warehouse → rack)", () => {
    const report = verifyPhysicalContainmentIntegrity([
      loc("wh", "WH", "warehouse"),
      loc("rack", "RACK", "rack", "wh"),
    ]);
    expect(report.ok).toBe(true);
    expect(report.counts.contextRootRelationships).toBe(1);
  });

  it("classifies a legacy-compatible pair without failing", () => {
    const report = verifyPhysicalContainmentIntegrity([
      loc("tray", "TRAY", "tray"),
      loc("bin", "BIN", "bin", "tray"),
    ]);
    expect(report.ok).toBe(true);
    expect(report.legacyCompatible).toHaveLength(1);
    // The report shows the RAW persisted kinds; `tray` is the legacy spelling
    // that canonicalizes to `matrix_tray`.
    expect(report.legacyCompatible[0]!.pair).toBe("tray → bin");
    expect(report.counts.legacyCompatibleRelationships).toBe(1);
  });

  it("fails a dangling container reference (1)", () => {
    const report = verifyPhysicalContainmentIntegrity([
      loc("drw", "DRW", "drawer", "missing"),
    ]);
    expect(report.ok).toBe(false);
    expect(codesOf(report)).toContain("DANGLING_CONTAINER");
  });

  it("fails an inactive container (2)", () => {
    const report = verifyPhysicalContainmentIntegrity([
      loc("cab", "CAB", "cabinet", null, { isActive: false }),
      loc("drw", "DRW", "drawer", "cab"),
    ]);
    expect(report.ok).toBe(false);
    expect(codesOf(report)).toContain("INACTIVE_CONTAINER");
  });

  it("fails self-containment (3)", () => {
    const report = verifyPhysicalContainmentIntegrity([
      loc("cab", "CAB", "cabinet", "cab"),
    ]);
    expect(report.ok).toBe(false);
    expect(codesOf(report)).toContain("SELF_CONTAINER");
  });

  it("fails a container cycle (4)", () => {
    const report = verifyPhysicalContainmentIntegrity([
      loc("a", "A", "cabinet", "b"),
      loc("b", "B", "shelf", "a"),
    ]);
    expect(report.ok).toBe(false);
    expect(codesOf(report)).toContain("CONTAINER_CYCLE");
  });

  it("fails an invalid category relationship (5)", () => {
    const report = verifyPhysicalContainmentIntegrity([
      loc("cab", "CAB", "cabinet"),
      loc("bin", "BIN", "bin", "cab"), // cabinet → bin is not canonical
    ]);
    expect(report.ok).toBe(false);
    expect(codesOf(report)).toContain("INVALID_CATEGORY");
  });

  it("fails a context-root rule violation (6)", () => {
    // warehouse → compartment is rejected by canBePhysicalContainer, so this
    // must be reported as a context-root rule violation too.
    const report = verifyPhysicalContainmentIntegrity([
      loc("wh", "WH", "warehouse"),
      loc("cmp", "CMP", "compartment", "wh"),
    ]);
    expect(report.ok).toBe(false);
    expect(codesOf(report)).toContain("CONTEXT_ROOT_RULE");
  });

  it("fails a leaf compartment used as a container (8)", () => {
    const report = verifyPhysicalContainmentIntegrity([
      loc("cmp", "CMP", "compartment"),
      loc("bin", "BIN", "bin", "cmp"),
    ]);
    expect(report.ok).toBe(false);
    expect(codesOf(report)).toContain("NON_ROOT_CONTAINER");
  });

  it("fails a reel_slot used as a container (8)", () => {
    const report = verifyPhysicalContainmentIntegrity([
      loc("slot", "SLOT", "reel_slot"),
      loc("bin", "BIN", "bin", "slot"),
    ]);
    expect(report.ok).toBe(false);
    expect(codesOf(report)).toContain("NON_ROOT_CONTAINER");
  });

  it("fails parentId drift when a baseline is supplied (10)", () => {
    const baseline = new Map<string, string | null>([["drw", "cab"]]);
    const report = verifyPhysicalContainmentIntegrity(
      [loc("cab", "CAB", "cabinet"), loc("drw", "DRW", "drawer", "cab")],
      { expectedParentById: baseline },
    );
    expect(report.ok).toBe(false);
    expect(codesOf(report)).toContain("PARENTID_DRIFT");
  });

  it("passes parentId when the baseline matches (10)", () => {
    const baseline = new Map<string, string | null>([["drw", "cab"]]);
    const report = verifyPhysicalContainmentIntegrity(
      [
        loc("cab", "CAB", "cabinet"),
        loc("drw", "DRW", "drawer", "cab", { parentId: "cab" }),
      ],
      { expectedParentById: baseline },
    );
    expect(codesOf(report)).not.toContain("PARENTID_DRIFT");
  });

  it("fails ledger drift when counts differ (11)", () => {
    const report = verifyPhysicalContainmentIntegrity([loc("cab", "CAB", "cabinet")], {
      expectedLedgerCount: 9,
      observedLedgerCount: 10,
    });
    expect(report.ok).toBe(false);
    expect(codesOf(report)).toContain("LEDGER_DRIFT");
  });

  it("reports deterministic ancestry depth", () => {
    const report = verifyPhysicalContainmentIntegrity([
      loc("a", "A", "cabinet"),
      loc("b", "B", "drawer", "a"),
      loc("c", "C", "bin", "b"),
      loc("d", "D", "compartment", "c"),
    ]);
    expect(report.counts.maxContainerDepth).toBe(3);
  });

  it("never mutates its input", () => {
    const input = [loc("cab", "CAB", "cabinet"), loc("drw", "DRW", "drawer", "cab")];
    const snapshot = JSON.stringify(input);
    verifyPhysicalContainmentIntegrity(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});