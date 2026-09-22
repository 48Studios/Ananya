import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { ComponentReviewFindingDto } from "./api/component-review-queue-api";
import {
  buildDuplicateAttributeRows,
  buildDuplicateSideBySideRows,
  canApplyFinding,
  canApplyFindingAsUser,
  componentHref,
  decidableActions,
  deriveReviewPermissions,
  describeDuplicateDifferences,
  describeDuplicateIdentity,
  describeDuplicateMatches,
  describeDuplicateSignals,
  describeManufacturerConflict,
  describePackagingVariant,
  duplicateDecisionCopy,
  duplicateDecisionNotesPlaceholder,
  duplicateMatchType,
  duplicateReviewGuidance,
  isDuplicateMatchType,
  isSemanticDuplicateMatch,
  QUEUE_TABS,
  supportingDuplicateMatchTypes,
  summarizeDuplicateSimilarity,
} from "./component-review-queue";

/**
 * Pass 5C coverage for the duplicate investigation experience.
 *
 * There is no DOM testing library in this workspace, so rendering is covered by
 * (a) presentation logic that produces exactly what the panel shows, and
 * (b) source assertions against the shipped component. That mirrors the
 * existing queue-dialog layout suite.
 */

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

const panelPath =
  "components/components/component-review-duplicate-investigation.tsx";
const dialogPath =
  "components/components/component-review-queue-finding-dialog.tsx";

const refs = {
  manufacturerNames: new Map([
    ["mfg-yageo", "Yageo"],
    ["mfg-murata", "Murata"],
  ]),
  categoryNames: new Map([
    ["cat-resistors", "Resistors"],
    ["cat-capacitors", "Capacitors"],
    ["cat-ics", "Microcontrollers"],
  ]),
};

function component(
  overrides: Partial<ComponentReviewFindingDto["component"]> = {},
): NonNullable<ComponentReviewFindingDto["component"]> {
  return {
    id: "comp-current",
    sku: "CMP-000421",
    name: "27 Ohm Chip Resistor",
    manufacturerPartNumber: "RC0805FR-0727RL",
    manufacturerId: "mfg-yageo",
    categoryId: "cat-resistors",
    unit: "pcs",
    isActive: true,
    ...overrides,
  };
}

function buildFinding(
  overrides: Partial<ComponentReviewFindingDto> = {},
): ComponentReviewFindingDto {
  return {
    id: "finding-1",
    componentId: "comp-current",
    relatedComponentId: "comp-related",
    issueType: "EXACT_DUPLICATE",
    issueCategory: "DUPLICATE",
    title: "Duplicate manufacturer part number",
    description: "Two records describe the same part.",
    currentValue: { sku: "CMP-000421" },
    suggestedValue: {
      duplicateOfComponentId: "comp-related",
      duplicateOfSku: "CMP-000871",
      matchType: "EXACT_MPN",
      primaryMatchType: "EXACT_MPN",
      normalizedMpn: "RC0805FR0727RL",
    },
    confidence: 1,
    confidenceLevel: "HIGH",
    evidence: [],
    source: "analyzer:duplicate",
    modelVersion: null,
    intelligenceVersion: "component-review-v3",
    fingerprint: "fingerprint-1",
    status: "PENDING",
    reviewerId: null,
    reviewerEmail: null,
    reviewedAt: null,
    decisionNotes: null,
    metadata: {},
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    component: component(),
    relatedComponent: component({
      id: "comp-related",
      sku: "CMP-000871",
      name: "Chip Resistor 27 Ohm",
      manufacturerPartNumber: "rc0805fr0727rl",
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1-4. Exact duplicate
// ---------------------------------------------------------------------------

describe("Pass 5C — exact duplicate detail", () => {
  it("1. renders an exact duplicate with its verdict and rule", () => {
    const identity = describeDuplicateIdentity(buildFinding());

    expect(identity.verdict).toBe("Exact duplicate");
    expect(identity.matchType).toBe("EXACT_MPN");
    expect(identity.matchTypeLabel).toBe("Exact MPN match");
    expect(identity.origin).toBe("deterministic");
    expect(identity.originLabel).toBe("Deterministic match");
  });

  it("2. explains the same manufacturer + normalized MPN rule", () => {
    const identity = describeDuplicateIdentity(buildFinding());

    expect(identity.rule).toContain("Same manufacturer identity");
    expect(identity.rule).toContain("manufacturer part number");
    // The rule text must describe the recorded rule, not a generic claim.
    expect(identity.rule.toLowerCase()).not.toContain("look similar");
  });

  it("3a. renders every side-by-side identity field for both records", () => {
    const rows = buildDuplicateSideBySideRows(buildFinding(), refs);
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));

    expect(byLabel["Component"]!.current).toBe("27 Ohm Chip Resistor");
    expect(byLabel["Component"]!.related).toBe("Chip Resistor 27 Ohm");
    expect(byLabel["Internal SKU"]!.current).toBe("CMP-000421");
    expect(byLabel["Internal SKU"]!.related).toBe("CMP-000871");
    expect(byLabel["Status"]!.current).toBe("Active");
    // Identity-bearing rows are flagged so the panel can prioritize them.
    expect(byLabel["Manufacturer Part Number"]!.identity).toBe(true);
    expect(byLabel["Manufacturer"]!.identity).toBe(true);
    expect(byLabel["Category"]!.identity).toBe(true);
    expect(byLabel["Component"]!.identity).toBe(false);
  });

  it("3. renders matching identity fields", () => {
    const matches = describeDuplicateMatches(buildFinding(), refs);
    const byLabel = Object.fromEntries(
      matches.map((match) => [match.label, match.value]),
    );

    expect(byLabel["Manufacturer Part Number"]).toBe("RC0805FR-0727RL");
    expect(byLabel["Manufacturer"]).toBe("Yageo");
    expect(byLabel["Category"]).toBe("Resistors");
  });

  it("4. renders secondary differences as recorded inconsistencies", () => {
    const differences = describeDuplicateDifferences(
      buildFinding({
        // Categories and SKUs differ even though the MPN identity matches.
        relatedComponent: component({
          id: "comp-related",
          sku: "CMP-000871",
          categoryId: "cat-capacitors",
        }),
      }),
      refs,
    );
    const byLabel = Object.fromEntries(
      differences.map((difference) => [difference.label, difference]),
    );

    expect(byLabel["Category"]).toBeDefined();
    expect(byLabel["Category"]!.current).toBe("Resistors");
    expect(byLabel["Category"]!.related).toBe("Capacitors");
    // Manufacturer Part Number is identical after normalization, so it is not a
    // difference — the UI must not claim one.
    expect(byLabel["Manufacturer Part Number"]).toBeUndefined();
  });

  it("surfaces an inactive counterpart as a difference", () => {
    const differences = describeDuplicateDifferences(
      buildFinding({
        relatedComponent: component({ id: "comp-related", isActive: false }),
      }),
      refs,
    );
    expect(differences.map((difference) => difference.label)).toContain(
      "Status",
    );
  });
});

// ---------------------------------------------------------------------------
// 5-9. Potential duplicate
// ---------------------------------------------------------------------------

function semanticFinding(
  overrides: Partial<ComponentReviewFindingDto> = {},
): ComponentReviewFindingDto {
  return buildFinding({
    issueType: "POTENTIAL_DUPLICATE",
    confidence: 0.87,
    confidenceLevel: "MEDIUM",
    suggestedValue: {
      duplicateOfComponentId: "comp-related",
      duplicateOfSku: "CMP-000871",
      matchType: "SEMANTIC_NAME_SIMILARITY",
      primaryMatchType: "SEMANTIC_NAME_SIMILARITY",
      similarityScore: 0.87,
      nameSimilarity: 0.92,
      sharedTokens: ["10kohm", "0805", "resistor"],
      matchedSignals: [
        "MANUFACTURER_SAME",
        "CATEGORY_SAME",
        "NAME_SIMILARITY",
        "TECHNICAL_VALUES_AGREE",
        "PACKAGE_AGREES",
      ],
      penalizedSignals: ["MANUFACTURER_CONFLICT"],
    },
    metadata: {
      matchType: "SEMANTIC_NAME_SIMILARITY",
      primaryMatchType: "SEMANTIC_NAME_SIMILARITY",
      similarityScore: 0.87,
      nameSimilarity: 0.92,
      matchedSignals: [
        "MANUFACTURER_SAME",
        "CATEGORY_SAME",
        "NAME_SIMILARITY",
        "TECHNICAL_VALUES_AGREE",
        "PACKAGE_AGREES",
      ],
      penalizedSignals: ["MANUFACTURER_CONFLICT"],
      attributeComparison: [
        {
          code: "resistance",
          label: "Resistance",
          current: "10 kohm",
          related: "10 kohm",
          result: "MATCH",
        },
        {
          code: "package",
          label: "Package",
          current: "0805",
          related: "0603",
          result: "DIFFERENT",
        },
      ],
    },
    ...overrides,
  });
}

describe("Pass 5C — potential duplicate detail", () => {
  it("5. renders a potential duplicate verdict", () => {
    const identity = describeDuplicateIdentity(semanticFinding());

    expect(identity.verdict).toBe("Potential duplicate");
    expect(identity.matchType).toBe("SEMANTIC_NAME_SIMILARITY");
  });

  it("6. renders the similarity score as a percentage", () => {
    const similarity = summarizeDuplicateSimilarity(semanticFinding());

    expect(similarity).not.toBeNull();
    expect(similarity!.score).toBe(0.87);
    expect(similarity!.scorePercent).toBe(87);
    expect(similarity!.nameSimilarityPercent).toBe(92);
    expect(similarity!.sharedTokens).toContain("10kohm");
  });

  it("6b. renders no similarity block for deterministic matches", () => {
    expect(summarizeDuplicateSimilarity(buildFinding())).toBeNull();
  });

  it("7. renders matching signals in reviewer language", () => {
    const signals = describeDuplicateSignals(semanticFinding());

    expect(signals.matched).toContain("Same manufacturer");
    expect(signals.matched).toContain("Strong name similarity");
    expect(signals.matched).toContain("Technical values match");
    expect(signals.matched).toContain("Package matches");
    // Raw signal codes and scoring weights are implementation detail.
    expect(signals.matched.join(" ")).not.toContain("MANUFACTURER_SAME");
    expect(signals.matched.join(" ")).not.toContain("0.22");
  });

  it("8. renders penalized signals", () => {
    const signals = describeDuplicateSignals(semanticFinding());
    expect(signals.penalized).toContain("Different manufacturers");
  });

  it("9. puts differing specifications before matching ones", () => {
    const rows = buildDuplicateAttributeRows(semanticFinding());

    expect(rows[0]!.code).toBe("package");
    expect(rows[0]!.result).toBe("different");
    expect(rows[1]!.code).toBe("resistance");
    expect(rows[1]!.result).toBe("match");
  });

  it("9b. keeps the analyzer order for exact duplicates", () => {
    const rows = buildDuplicateAttributeRows(
      buildFinding({
        metadata: {
          attributeComparison: [
            {
              code: "package",
              label: "Package",
              current: "0805",
              related: "0805",
              result: "MATCH",
            },
            {
              code: "voltage_rating",
              label: "Voltage Rating",
              current: "25 V",
              related: "50 V",
              result: "DIFFERENT",
            },
          ],
        },
      }),
    );
    expect(rows.map((row) => row.code)).toEqual(["package", "voltage_rating"]);
  });

  it("emphasizes the differences that make a pair only a potential duplicate", () => {
    const differences = describeDuplicateDifferences(semanticFinding(), refs);
    const labels = differences.map((difference) => difference.label);

    expect(labels).toContain("Package");
    expect(differences.find((item) => item.label === "Package")!.current).toBe(
      "0805",
    );
    expect(differences.find((item) => item.label === "Package")!.related).toBe(
      "0603",
    );
  });

  it("tolerates findings persisted before the comparison field existed", () => {
    const legacy = buildFinding({
      issueType: "POTENTIAL_DUPLICATE",
      metadata: {},
      suggestedValue: { matchType: "SEMANTIC_NAME_SIMILARITY" },
    });

    expect(buildDuplicateAttributeRows(legacy)).toEqual([]);
    expect(describeDuplicateSignals(legacy)).toEqual({
      matched: [],
      penalized: [],
    });
    expect(summarizeDuplicateSimilarity(legacy)).toBeNull();
    // The rest of the panel still renders from the component summaries.
    expect(describeDuplicateIdentity(legacy).verdict).toBe(
      "Potential duplicate",
    );
  });
});

// ---------------------------------------------------------------------------
// 10-13. Specific rules
// ---------------------------------------------------------------------------

describe("Pass 5C — rule-specific explanations", () => {
  it("10. explains the packaging variant and the suffix it removed", () => {
    const finding = buildFinding({
      issueType: "POTENTIAL_DUPLICATE",
      suggestedValue: { matchType: "PACKAGING_VARIANT", primaryMatchType: "PACKAGING_VARIANT" },
      component: component({ manufacturerPartNumber: "RC0805FR0727RL" }),
      relatedComponent: component({
        id: "comp-related",
        sku: "CMP-000871",
        manufacturerPartNumber: "RC0805FR0727RLTR",
      }),
    });

    const packaging = describePackagingVariant(finding);
    expect(packaging).not.toBeNull();
    expect(packaging!.baseMpn).toBe("RC0805FR0727RL");
    expect(packaging!.variantMpn).toBe("RC0805FR0727RLTR");
    expect(packaging!.removedSuffix).toBe("TR");
    // Review-only: the copy must not imply the records are safe to merge.
    expect(packaging!.note.toLowerCase()).toContain("not necessarily");
    expect(packaging!.note.toLowerCase()).not.toContain("safe to merge");
  });

  it("10b. never invents a suffix the records do not show", () => {
    const finding = buildFinding({
      issueType: "POTENTIAL_DUPLICATE",
      suggestedValue: { matchType: "PACKAGING_VARIANT" },
      component: component({ manufacturerPartNumber: "ABC123" }),
      relatedComponent: component({
        id: "comp-related",
        manufacturerPartNumber: "XYZ789",
      }),
    });

    const packaging = describePackagingVariant(finding);
    expect(packaging!.removedSuffix).toBeNull();
  });

  it("10c. explains nothing for other rules", () => {
    expect(describePackagingVariant(buildFinding())).toBeNull();
  });

  it("11. explains the manufacturer conflict as a data question", () => {
    const finding = buildFinding({
      issueType: "POTENTIAL_DUPLICATE",
      suggestedValue: {
        matchType: "MPN_MANUFACTURER_CONFLICT",
        primaryMatchType: "MPN_MANUFACTURER_CONFLICT",
      },
      component: component({ manufacturerId: "mfg-yageo" }),
      relatedComponent: component({
        id: "comp-related",
        manufacturerId: "mfg-murata",
      }),
    });

    const conflict = describeManufacturerConflict(finding, refs);
    expect(conflict).not.toBeNull();
    expect(conflict!.currentManufacturer).toBe("Yageo");
    expect(conflict!.relatedManufacturer).toBe("Murata");
    expect(conflict!.note).toContain("two manufacturer identities");
    // Must read as an investigation prompt, not a confirmed duplicate.
    expect(conflict!.note.toLowerCase()).toContain("check which");

    const identity = describeDuplicateIdentity(finding);
    expect(identity.rule).toContain("two different manufacturer identities");
    expect(identity.origin).toBe("deterministic");
    expect(duplicateReviewGuidance(finding)).toContain("authoritative");
  });

  it("11b. reports a missing manufacturer as unassigned", () => {
    const finding = buildFinding({
      issueType: "POTENTIAL_DUPLICATE",
      suggestedValue: { matchType: "MPN_MANUFACTURER_CONFLICT" },
      component: component({ manufacturerId: null }),
    });
    expect(
      describeManufacturerConflict(finding, refs)!.currentManufacturer,
    ).toBe("Not assigned");
  });

  it("12. explains the name + attribute identity rule", () => {
    const finding = buildFinding({
      issueType: "POTENTIAL_DUPLICATE",
      suggestedValue: { matchType: "NAME_ATTRIBUTE_IDENTITY" },
    });

    const identity = describeDuplicateIdentity(finding);
    expect(identity.matchTypeLabel).toBe("Name + attribute identity");
    expect(identity.rule).toContain("normalized name");
    expect(identity.rule).toContain("no conflicting recorded specification");
    expect(identity.origin).toBe("deterministic");
  });

  it("13. explains the semantic name similarity rule", () => {
    const identity = describeDuplicateIdentity(semanticFinding());

    expect(identity.matchTypeLabel).toBe("Semantic name similarity");
    expect(identity.origin).toBe("semantic");
    expect(identity.originLabel).toBe("Semantic candidate");
    expect(identity.rule).toContain("no shared manufacturer part number");
    expect(isSemanticDuplicateMatch("SEMANTIC_NAME_SIMILARITY")).toBe(true);
    expect(isSemanticDuplicateMatch("EXACT_MPN")).toBe(false);
  });

  it("13b. lists supporting rules without inventing classifications", () => {
    const finding = buildFinding({
      suggestedValue: {
        matchType: "EXACT_MPN",
        primaryMatchType: "EXACT_MPN",
        supportingMatchTypes: [
          "NAME_ATTRIBUTE_IDENTITY",
          "SEMANTIC_NAME_SIMILARITY",
          "NOT_A_REAL_RULE",
        ],
      },
    });

    const identity = describeDuplicateIdentity(finding);
    expect(identity.supporting.map((rule) => rule.matchType)).toEqual([
      "NAME_ATTRIBUTE_IDENTITY",
      "SEMANTIC_NAME_SIMILARITY",
    ]);
    expect(supportingDuplicateMatchTypes(finding)).toEqual([
      "NAME_ATTRIBUTE_IDENTITY",
      "SEMANTIC_NAME_SIMILARITY",
    ]);
  });

  it("13c. reads the match type from metadata when suggestedValue lacks it", () => {
    const finding = buildFinding({
      suggestedValue: { duplicateOfSku: "CMP-000871" },
      metadata: { matchType: "PACKAGING_VARIANT" },
    });
    expect(duplicateMatchType(finding)).toBe("PACKAGING_VARIANT");
    expect(describeDuplicateIdentity(finding).matchTypeLabel).toBe(
      "Packaging variant",
    );
  });

  it("13d. falls back to the issue type for legacy rows", () => {
    const finding = buildFinding({ suggestedValue: null, metadata: {} });
    expect(duplicateMatchType(finding)).toBe("EXACT_MPN");
    expect(isDuplicateMatchType("NOPE")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 14-17. Actions
// ---------------------------------------------------------------------------

describe("Pass 5C — duplicate actions", () => {
  it("14. offers no Apply action for duplicates", () => {
    // A reviewer with the component-write permission still cannot APPLY a
    // duplicate finding: the two records are not a field-level suggestion.
    // Consolidation is a separate, explicitly confirmed operation that retires
    // a component rather than editing one.
    expect(deriveReviewPermissions(true).canApply).toBe(true);
    expect(canApplyFinding(buildFinding())).toBe(false);
    expect(canApplyFindingAsUser(buildFinding(), true)).toBe(false);
    expect(canApplyFindingAsUser(semanticFinding(), true)).toBe(false);

    const source = read(panelPath);
    expect(source).not.toContain("applyFinding");
    expect(source).not.toMatch(/\bApply\b/);
    // No destructive shortcut: consolidation retires, it never merges or deletes.
    expect(source).not.toContain("Merge");
    expect(source).not.toContain("Delete");
  });

  it("15. maps 'Not a duplicate' to the existing rejection decision", () => {
    const finding = buildFinding();
    const rejection = duplicateDecisionCopy(finding, "REJECTED");

    expect(rejection.label).toBe("Not a duplicate");
    expect(rejection.confirmText).toBe("Not a duplicate");
    expect(rejection.variant).toBe("destructive");

    // No new backend state: the existing lifecycle still offers REJECTED.
    expect(decidableActions("PENDING")).toContain("REJECTED");
  });

  it("15b. keeps acceptance explicitly merge-free", () => {
    const accepted = duplicateDecisionCopy(buildFinding(), "ACCEPTED");
    expect(accepted.label).toBe("Accept finding");
    expect(accepted.description).toContain("merged");
    expect(accepted.description).toContain("No component is merged");

    const dismissed = duplicateDecisionCopy(buildFinding(), "DISMISSED");
    expect(dismissed.description).toContain("No component is modified");
  });

  it("15c. leaves non-duplicate decision copy untouched", () => {
    const nonDuplicate = buildFinding({
      issueCategory: "IDENTITY",
      relatedComponentId: null,
      issueType: "MPN_CONFLICT",
    });
    expect(duplicateDecisionCopy(nonDuplicate, "REJECTED").label).toBe(
      "Reject finding",
    );
  });

  it("16. offers duplicate-specific decision note guidance", () => {
    expect(duplicateDecisionNotesPlaceholder({ issueType: "POTENTIAL_DUPLICATE" })).toContain(
      "different voltage variants",
    );
    expect(duplicateDecisionNotesPlaceholder({ issueType: "EXACT_DUPLICATE" })).toContain(
      "manufacturer is wrong",
    );
    // Notes stay optional: the field is described as optional by the dialog.
    expect(read(dialogPath)).toContain("Decision notes (optional)");
  });

  it("17. keeps permission restrictions intact", () => {
    const readOnly = deriveReviewPermissions(false);
    expect(readOnly.canDecide).toBe(false);
    expect(readOnly.isReadOnly).toBe(true);

    // The shortcut is gated on canDecide in the shipped component.
    expect(read(dialogPath)).toContain("canDecide={");
    expect(read(dialogPath)).toContain("permissions.canDecide");
    expect(read(panelPath)).toContain("canDecide && onNotADuplicate");
  });

  it("17b. renders the review-only explanation for duplicates", () => {
    const source = read(panelPath);
    expect(source).toContain("review-only");
    expect(source).toContain("does not merge");
    expect(source).toContain("the inconsistent fields above need a data-quality fix");
  });
});

// ---------------------------------------------------------------------------
// 18-20. Safety, navigation, layout
// ---------------------------------------------------------------------------

describe("Pass 5C — safety, navigation and layout", () => {
  it("18. preserves stale/fingerprint protection", () => {
    const dialog = read(dialogPath);
    // The stale banner is untouched, and both writes still travel through the
    // shared payload builders, which are the only place the revision proof is
    // assembled — so an assignment cannot bypass the backend's concurrency check.
    expect(dialog).toContain("staleExplanation(finding)");
    expect(dialog).toContain("buildDecisionPayload(finding, decision, decisionNotes)");
    expect(dialog).toContain("buildApplyPayload(");

    // Duplicate detail adds no bypass of the backend concurrency check. The
    // assertion targets the actual bypass vectors rather than the bare word
    // "fingerprint": the investigation panel may *describe* the concept, but it
    // must never carry the concurrency payload or call the execute endpoint
    // itself. Execution stays inside the consolidation flow, which always sends
    // the fingerprint the backend re-verifies.
    const panel = read(panelPath);
    expect(panel).not.toContain("expectedFingerprint");
    expect(panel).not.toContain("consolidateComponent");
    expect(panel).not.toContain("/consolidate");
  });

  it("19. links both components to the existing detail route", () => {
    const panel = read(panelPath);
    const dialog = read(dialogPath);

    expect(componentHref("comp-1")).toBe("/components/comp-1");
    expect(componentHref("a/b")).toBe("/components/a%2Fb");
    expect(panel).toContain("componentHref(side.component.id)");
    expect(dialog).toContain("View related component");
    expect(dialog).toContain("componentHref(finding.component.id)");
  });

  it("20. keeps the comparison readable at narrower widths", () => {
    const panel = read(panelPath);

    // Two-column header/side-by-side grid that collapses, plus wrapping text so
    // nothing overflows horizontally.
    expect(panel).toContain("grid-cols-2");
    expect(panel).toContain("break-words");
    expect(panel).toContain("flex-wrap");
    expect(panel).toContain("table-fixed");
    // Long part numbers wrap rather than widen the layout.
    expect(panel).toContain("break-all");
    expect(panel).not.toContain("overflow-x-scroll");
  });

  it("20b. avoids reintroducing vertical-space waste", () => {
    const panel = read(panelPath);

    // No oversized header or statistics cards inside the investigation panel.
    expect(panel).not.toMatch(/text-(2xl|3xl|4xl)/);
    expect(panel).not.toContain("Dashboard");
    // Long attribute lists collapse behind an explicit toggle.
    expect(panel).toContain("VISIBLE_WHEN_COLLAPSED");
    expect(panel).toContain("Show all");
  });
});

// ---------------------------------------------------------------------------
// 21-23. Regression
// ---------------------------------------------------------------------------

describe("Pass 5C — regression", () => {
  it("21. renders non-duplicate findings unchanged", () => {
    const nonDuplicate = buildFinding({
      issueCategory: "IDENTITY",
      relatedComponentId: null,
      relatedComponent: null,
      issueType: "MPN_CONFLICT",
    });

    expect(describeDuplicateIdentity(nonDuplicate).verdict).toBe(
      "Potential duplicate",
    );
    // The panel is only mounted for duplicate findings.
    expect(read(dialogPath)).toContain("{duplicate && finding && (");
    // Non-duplicates keep the apply path.
    expect(canApplyFinding(nonDuplicate)).toBe(true);
  });

  it("22. leaves the Attribute Intelligence review untouched", () => {
    const attributeDialog = read(
      "components/attributes/attribute-review-queue-dialog.tsx",
    );
    expect(attributeDialog).not.toContain("DuplicateInvestigation");
    expect(attributeDialog).not.toContain("duplicate-investigation");
  });

  it("23. leaves the review-item card design unchanged", () => {
    const queueDialog = read(
      "components/components/component-review-queue-dialog.tsx",
    );
    // The card design (locked) is untouched by this pass: the investigation
    // panel is mounted only in the detail dialog.
    expect(queueDialog).not.toContain("DuplicateInvestigation");
    expect(queueDialog).not.toContain("duplicate-investigation");
  });

  it("23b. keeps the queue filters unchanged", () => {
    const queueDialog = read(
      "components/components/component-review-queue-dialog.tsx",
    );
    expect(queueDialog).toContain("matchesQueueTab");
    expect(queueDialog).toContain("buildQueueTabCounts");
    expect(QUEUE_TABS.map((tab) => tab.id)).toContain("DUPLICATES");
  });
});
