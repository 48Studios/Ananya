import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  buildDecisionPayload,
  buildApplyPayload,
  componentReviewQueueApi,
  MAX_QUEUE_PAGE_SIZE,
  type ComponentReviewFindingDto,
  type ComponentReviewQueueSummaryDto,
} from "./api/component-review-queue-api";
import {
  APPLY_DUPLICATE_NOTE,
  APPLY_REVIEW_ONLY_COPY,
  APPLY_WARNING,
  APPLY_COPY,
  ASSIGN_COPY,
  ASSIGN_WARNING,
  actionConsequenceNote,
  actionableFindingCount,
  applyActionCopy,
  applyAssignableEntity,
  applyAssignmentFieldLabel,
  applyAssignmentHint,
  applyConflictMessage,
  applySuccessMessage,
  applyUnavailableReason,
  auditUnavailableReason,
  buildApplyConfirmationRows,
  buildDuplicateComparisonRows,
  buildAttributeQueueBreakdown,
  buildFindingValueSummary,
  buildIdentityRows,
  buildQueueTabCounts,
  canApplyFinding,
  canApplyFindingAsUser,
  canDecide,
  COMPONENT_WRITE_PERMISSION,
  CONFIDENCE_FILTER_OPTIONS,
  deriveReviewPermissions,
  reviewReadOnlyNotice,
  decidableActions,
  DECISION_ALLOWED_STATUSES,
  DECISION_COPY,
  deriveQueueCounts,
  describeDuplicateRelationship,
  extractApplyConflictReason,
  filterValueToParam,
  formatConfidencePercent,
  formatEvidenceWeight,
  formatValueEntries,
  hasActiveFilters,
  isDuplicateFinding,
  isStale,
  isTerminal,
  ISSUE_CATEGORY_FILTER_OPTIONS,
  ISSUE_CATEGORY_LABELS,
  ISSUE_TYPE_FILTER_OPTIONS,
  issueTypeLabel,
  matchesQueueTab,
  normalizeEvidence,
  queueEmptyStateCopy,
  QUEUE_TABS,
  queueCardActions,
  staleExplanation,
  STATUS_FILTER_OPTIONS,
  suggestedEntityAssignment,
  summarizeAuditResult,
} from "./component-review-queue";

function buildFinding(
  overrides: Partial<ComponentReviewFindingDto> = {},
): ComponentReviewFindingDto {
  return {
    id: "finding-1",
    componentId: "comp-current",
    relatedComponentId: null,
    issueType: "MPN_CONFLICT",
    issueCategory: "IDENTITY",
    title: "Manufacturer part number may be incorrect",
    description: "Recorded value differs from the identified value.",
    currentValue: { manufacturerPartNumber: "RC0805FR-0710RL" },
    suggestedValue: { manufacturerPartNumber: "RC0805FR-0727RL" },
    confidence: 0.9,
    confidenceLevel: "HIGH",
    evidence: [],
    source: "analyzer:identity",
    modelVersion: "1.0.0",
    intelligenceVersion: "component-review-v1",
    fingerprint: "fingerprint-1",
    status: "PENDING",
    reviewerId: null,
    reviewerEmail: null,
    reviewedAt: null,
    decisionNotes: null,
    metadata: {},
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    component: {
      id: "comp-current",
      sku: "CMP-000421",
      name: "27 Ohm Chip Resistor",
      manufacturerPartNumber: "RC0805FR-0710RL",
      manufacturerId: "mfg-yageo",
      categoryId: "cat-resistors",
      unit: "pcs",
      isActive: true,
    },
    relatedComponent: null,
    ...overrides,
  };
}

const summary: ComponentReviewQueueSummaryDto = {
  total: 12,
  pending: 7,
  accepted: 2,
  rejected: 2,
  dismissed: 0,
  stale: 1,
  byCategory: { IDENTITY: 6, CLASSIFICATION: 4, DUPLICATE: 2 },
};

describe("Component Review Queue labels", () => {
  it("exposes a human-readable label for every canonical issue type", () => {
    expect(issueTypeLabel("MPN_MISSING")).toBe(
      "Missing Manufacturer Part Number",
    );
    expect(issueTypeLabel("MPN_CONFLICT")).toBe(
      "Manufacturer Part Number Conflict",
    );
    expect(issueTypeLabel("MANUFACTURER_UNRESOLVED")).toBe(
      "Manufacturer Unresolved",
    );
    expect(issueTypeLabel("MANUFACTURER_CONFLICT")).toBe(
      "Manufacturer Conflict",
    );
    expect(issueTypeLabel("CATEGORY_UNRESOLVED")).toBe("Category Unresolved");
    expect(issueTypeLabel("CATEGORY_CONFLICT")).toBe("Category Conflict");
    expect(issueTypeLabel("EXACT_DUPLICATE")).toBe("Exact Duplicate");
    expect(issueTypeLabel("POTENTIAL_DUPLICATE")).toBe("Potential Duplicate");
    // Both review-only attribute findings are named, so the queue never shows a
    // raw enum to a reviewer.
    expect(issueTypeLabel("ATTRIBUTE_VALUE_UNKNOWN")).toBe(
      "Specification Not Determined",
    );
    expect(issueTypeLabel("DOCUMENT_CONFLICT")).toBe("Documents Disagree");
  });

  it("falls back to a humanized label for unknown types without inventing one", () => {
    expect(issueTypeLabel("SOME_FUTURE_TYPE")).toBe("Some Future Type");
  });
});

describe("Component Review Queue confidence", () => {
  it("formats confidence as a percentage", () => {
    expect(formatConfidencePercent(0.97)).toBe("97%");
    expect(formatConfidencePercent(0.5)).toBe("50%");
    expect(formatConfidencePercent(null)).toBe("—");
    expect(formatConfidencePercent(undefined)).toBe("—");
  });

  it("formats evidence weights to two decimals", () => {
    expect(formatEvidenceWeight(0.9)).toBe("0.90");
    expect(formatEvidenceWeight(null)).toBeNull();
  });
});

describe("Component Review Queue lifecycle", () => {
  it("allows every decision from PENDING", () => {
    expect(canDecide("PENDING", "ACCEPTED")).toBe(true);
    expect(canDecide("PENDING", "REJECTED")).toBe(true);
    expect(canDecide("PENDING", "DISMISSED")).toBe(true);
  });

  it("protects stale findings from acceptance while allowing resolution", () => {
    expect(canDecide("STALE", "ACCEPTED")).toBe(false);
    expect(canDecide("STALE", "REJECTED")).toBe(true);
    expect(canDecide("STALE", "DISMISSED")).toBe(true);
    expect(decidableActions("STALE")).toEqual(["REJECTED", "DISMISSED"]);
    expect(isStale({ status: "STALE" })).toBe(true);
    expect(isStale({ status: "PENDING" })).toBe(false);
  });

  it("treats decided findings as terminal", () => {
    for (const status of ["ACCEPTED", "REJECTED", "DISMISSED"] as const) {
      expect(decidableActions(status)).toEqual([]);
      expect(isTerminal({ status })).toBe(true);
    }
    expect(isTerminal({ status: "PENDING" })).toBe(false);
  });

  it("mirrors the backend transition table", () => {
    expect(DECISION_ALLOWED_STATUSES.ACCEPTED).toEqual(["PENDING"]);
    expect(DECISION_ALLOWED_STATUSES.REJECTED).toEqual(["PENDING", "STALE"]);
    expect(DECISION_ALLOWED_STATUSES.DISMISSED).toEqual(["PENDING", "STALE"]);
  });

  it("states that acceptance does not modify the component", () => {
    expect(DECISION_COPY.ACCEPTED.description).toMatch(/not modified/i);
    expect(DECISION_COPY.ACCEPTED.description).toMatch(/no manufacturer/i);
    expect(DECISION_COPY.REJECTED.description).toMatch(/unchanged/i);
    expect(DECISION_COPY.DISMISSED.description).toMatch(/unchanged/i);
  });

  it("explains why a finding is stale", () => {
    const finding = buildFinding({
      status: "STALE",
      metadata: {
        staleReason: "the component changed after this finding was generated",
      },
    });
    const explanation = staleExplanation(finding);
    expect(explanation).toContain("stale");
    expect(explanation).toContain("Re-run");
    expect(explanation).toContain("not accepted");

    const fallback = staleExplanation(buildFinding({ status: "STALE" }));
    expect(fallback).toContain("the component changed");
  });

  it("builds decision payloads with lifecycle fields only", () => {
    const finding = buildFinding();
    const payload = buildDecisionPayload(
      finding,
      "ACCEPTED",
      "  looks right  ",
    );
    expect(payload).toEqual({
      decision: "ACCEPTED",
      expectedFingerprint: "fingerprint-1",
      decisionNotes: "looks right",
    });

    const bare = buildDecisionPayload(finding, "DISMISSED");
    expect(Object.keys(bare).sort()).toEqual([
      "decision",
      "expectedFingerprint",
    ]);
  });
});

describe("Component Review Queue filters", () => {
  it("offers every canonical status, issue category, and issue type", () => {
    // The five lifecycle statuses plus the combined outstanding-work option, in
    // the shared order — identical to the Attribute and Documentation surfaces.
    expect(STATUS_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      "PENDING",
      "ACCEPTED",
      "REJECTED",
      "DISMISSED",
      "STALE",
      "PENDING,STALE",
    ]);
    expect(
      STATUS_FILTER_OPTIONS.find((option) => option.value === "PENDING")?.label,
    ).toBe("Needs review");

    // DATA_QUALITY keeps a label but is not filterable: the backend emits no
    // findings in that category yet.
    expect(ISSUE_CATEGORY_FILTER_OPTIONS.map((option) => option.value)).toEqual(
      ["IDENTITY", "CLASSIFICATION", "ATTRIBUTE_VALUE", "DUPLICATE"],
    );
    expect(ISSUE_CATEGORY_LABELS.DATA_QUALITY).toBe("Data Quality");

    expect(ISSUE_TYPE_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      "MPN_MISSING",
      "MPN_CONFLICT",
      "MANUFACTURER_UNRESOLVED",
      "MANUFACTURER_CONFLICT",
      "CATEGORY_UNRESOLVED",
      "CATEGORY_CONFLICT",
      "EXACT_DUPLICATE",
      "POTENTIAL_DUPLICATE",
      "ATTRIBUTE_VALUE_SUGGESTION",
      "ATTRIBUTE_VALUE_UNKNOWN",
      "DOCUMENT_CONFLICT",
    ]);
    expect(CONFIDENCE_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      "HIGH",
      "MEDIUM",
      "LOW",
    ]);
    expect(CONFIDENCE_FILTER_OPTIONS.map((option) => option.label)).toEqual([
      "High confidence",
      "Medium confidence",
      "Low confidence",
    ]);
  });

  it("converts the ALL sentinel to an omitted parameter", () => {
    expect(filterValueToParam("ALL")).toBeUndefined();
    expect(filterValueToParam("")).toBeUndefined();
    expect(filterValueToParam(undefined)).toBeUndefined();
    expect(filterValueToParam("PENDING")).toBe("PENDING");
  });

  it("detects whether any filter is active", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ status: "ALL", search: "   " })).toBe(false);
    expect(hasActiveFilters({ status: "PENDING" })).toBe(true);
    expect(hasActiveFilters({ search: "RC0805" })).toBe(true);
    expect(hasActiveFilters({ confidenceLevel: "HIGH" })).toBe(true);
  });
});

describe("Component Review Queue summary counts", () => {
  it("uses backend counts and the backend high-confidence total", () => {
    const counts = deriveQueueCounts(summary, 5);
    const byKey = Object.fromEntries(counts.map((c) => [c.key, c.value]));

    expect(byKey.pending).toBe(7);
    expect(byKey.highConfidence).toBe(5);
    expect(byKey.identity).toBe(6);
    expect(byKey.classification).toBe(4);
    expect(byKey.duplicate).toBe(2);
    expect(byKey.stale).toBe(1);
    expect(counts.every((c) => c.label.length > 0 && c.hint.length > 0)).toBe(
      true,
    );
  });

  it("tolerates a missing summary without inventing counts", () => {
    const counts = deriveQueueCounts(null, null);
    expect(counts.every((c) => c.value === 0)).toBe(true);
  });

  it("tolerates a summary without category breakdown", () => {
    const counts = deriveQueueCounts(
      { ...summary, byCategory: undefined as never },
      0,
    );
    const byKey = Object.fromEntries(counts.map((c) => [c.key, c.value]));
    expect(byKey.identity).toBe(0);
    expect(byKey.duplicate).toBe(0);
  });
});

describe("Component Review Queue empty states", () => {
  it("distinguishes a clear queue from filtered-out results", () => {
    const clear = queueEmptyStateCopy(false);
    expect(clear.title).toContain("clear");
    expect(clear.description).toContain("audit");

    const filtered = queueEmptyStateCopy(true);
    expect(filtered.title).toContain("No findings match");
    expect(filtered.description).toContain("filters");
  });
});

describe("Component Review Queue values", () => {
  it("orders well-known keys ahead of unknown ones", () => {
    const entries = formatValueEntries({
      zzzUnknown: "last",
      categoryName: "Resistors",
      manufacturerPartNumber: "RC0805FR-0727RL",
    });
    expect(entries.map((entry) => entry.label)).toEqual([
      "Manufacturer Part Number",
      "Category Name",
      "Zzz Unknown",
    ]);
  });

  it("formats scalars, booleans, arrays, and nested objects readably", () => {
    const entries = formatValueEntries({
      manufacturerPartNumber: "RC0805FR-0727RL",
      collidesWithExistingComponent: true,
      categoryPath: ["Electronic Components", "Resistors"],
      nested: { code: "YAGEO" },
      empty: null,
      blank: "   ",
    });
    const byLabel = Object.fromEntries(
      entries.map((entry) => [entry.label, entry.value]),
    );

    expect(byLabel["Manufacturer Part Number"]).toBe("RC0805FR-0727RL");
    expect(byLabel["Collides With Existing Component"]).toBe("Yes");
    expect(byLabel["Category Path"]).toBe("Electronic Components, Resistors");
    expect(byLabel.Nested).toBe("Code: YAGEO");
    expect(byLabel.Empty).toBe("—");
    expect(byLabel.Blank).toBe("—");
  });

  it("returns no entries for absent values", () => {
    expect(formatValueEntries(null)).toEqual([]);
    expect(formatValueEntries(undefined)).toEqual([]);
    expect(formatValueEntries({})).toEqual([]);
  });
});

describe("Component Review Queue evidence", () => {
  it("normalizes backend evidence including provenance", () => {
    const items = normalizeEvidence([
      {
        type: "mpn_pattern",
        description: 'Manufacturer part number "RC0805FR-0727RL" identified',
        weight: 0.9,
        source: "analyzer:mpn_extraction",
      },
      {
        type: "data_pack_rule",
        description: "Active Data Pack specifies this attribute",
        weight: 0.95,
        source: "datapack:electronics-smd",
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]!.typeLabel).toBe("MPN pattern");
    expect(items[0]!.weight).toBe(0.9);
    expect(items[0]!.source).toBe("analyzer:mpn_extraction");
    expect(items[1]!.typeLabel).toBe("Data Pack rule");
    expect(items[1]!.source).toBe("datapack:electronics-smd");
  });

  it("drops entries without a description instead of fabricating one", () => {
    const items = normalizeEvidence([
      { type: "anomaly", weight: 0.8 },
      { type: "anomaly", description: "   " },
      { type: "anomaly", description: "Real evidence" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.description).toBe("Real evidence");
  });

  it("tolerates malformed evidence payloads", () => {
    expect(normalizeEvidence(null)).toEqual([]);
    expect(normalizeEvidence(undefined)).toEqual([]);
    expect(normalizeEvidence([null as never, "string" as never])).toEqual([]);
  });
});

describe("Component Review Queue component identity", () => {
  it("resolves manufacturer and category names from reference maps", () => {
    const rows = buildIdentityRows(buildFinding().component, {
      manufacturerNames: new Map([["mfg-yageo", "Yageo"]]),
      categoryNames: new Map([["cat-resistors", "Resistors"]]),
    });
    const byLabel = Object.fromEntries(
      rows.map((row) => [row.label, row.value]),
    );

    expect(byLabel["Component"]).toBe("27 Ohm Chip Resistor");
    expect(byLabel["Internal SKU"]).toBe("CMP-000421");
    expect(byLabel["Manufacturer"]).toBe("Yageo");
    expect(byLabel["Category"]).toBe("Resistors");
  });

  it("shows placeholders when references cannot be resolved", () => {
    const rows = buildIdentityRows(
      {
        ...buildFinding().component!,
        manufacturerId: null,
        categoryId: null,
        manufacturerPartNumber: null,
      },
      {},
    );
    const byLabel = Object.fromEntries(
      rows.map((row) => [row.label, row.value]),
    );
    expect(byLabel["Manufacturer"]).toBe("—");
    expect(byLabel["Category"]).toBe("—");
    expect(byLabel["Manufacturer Part Number"]).toBe("—");
  });

  it("returns no rows without a component summary", () => {
    expect(buildIdentityRows(null)).toEqual([]);
  });
});

describe("Component Review Queue duplicate comparison", () => {
  const duplicateFinding = buildFinding({
    issueType: "EXACT_DUPLICATE",
    issueCategory: "DUPLICATE",
    relatedComponentId: "comp-related",
    component: {
      id: "comp-current",
      sku: "CMP-000421",
      name: "27 Ohm Chip Resistor",
      manufacturerPartNumber: "RC0805FR-0727RL",
      manufacturerId: "mfg-yageo",
      categoryId: "cat-resistors",
      unit: "pcs",
      isActive: true,
    },
    relatedComponent: {
      id: "comp-related",
      sku: "CMP-000871",
      name: "Chip Resistor 27 Ohm",
      manufacturerPartNumber: "rc0805fr0727rl",
      manufacturerId: "mfg-yageo",
      categoryId: "cat-capacitors",
      unit: "pcs",
      isActive: true,
    },
    suggestedValue: {
      duplicateOfComponentId: "comp-related",
      duplicateOfSku: "CMP-000871",
      matchType: "EXACT_MPN",
      normalizedMpn: "RC0805FR0727RL",
    },
  });

  const refs = {
    manufacturerNames: new Map([
      ["mfg-yageo", "Yageo"],
      ["mfg-murata", "Murata"],
    ]),
    categoryNames: new Map([
      ["cat-resistors", "Resistors"],
      ["cat-capacitors", "Capacitors"],
    ]),
  };

  it("detects duplicate findings that carry a related component", () => {
    expect(isDuplicateFinding(duplicateFinding)).toBe(true);
    expect(isDuplicateFinding(buildFinding())).toBe(false);
  });

  it("renders side-by-side identity rows with emphasis cues", () => {
    const rows = buildDuplicateComparisonRows(duplicateFinding, refs);
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));

    expect(byLabel["Manufacturer Part Number"]!.emphasis).toBe("match");
    expect(byLabel["Manufacturer Part Number"]!.note).toContain(
      "normalization",
    );
    expect(byLabel["Internal SKU"]!.emphasis).toBe("neutral");
    expect(byLabel["Manufacturer"]!.emphasis).toBe("match");
    expect(byLabel["Category"]!.emphasis).toBe("difference");
    expect(byLabel["Category"]!.current).toBe("Resistors");
    expect(byLabel["Category"]!.related).toBe("Capacitors");
  });

  it("explains an exact duplicate from backend values", () => {
    const relationship = describeDuplicateRelationship(duplicateFinding);
    expect(relationship.heading).toContain("Exact duplicate");
    expect(relationship.explanation).toContain("CMP-000871");
    expect(relationship.explanation).toContain("identical");
  });

  it("explains a packaging-variant duplicate", () => {
    const variant = buildFinding({
      issueType: "POTENTIAL_DUPLICATE",
      issueCategory: "DUPLICATE",
      relatedComponentId: "comp-related",
      relatedComponent: {
        ...duplicateFinding.relatedComponent!,
        manufacturerPartNumber: "RC0805FR-0710KL",
      },
      component: {
        ...duplicateFinding.component!,
        manufacturerPartNumber: "RC0805FR-0710KLTR",
      },
      suggestedValue: { matchType: "PACKAGING_VARIANT" },
    });

    const relationship = describeDuplicateRelationship(variant);
    expect(relationship.heading).toContain("packaging variant");
    expect(relationship.explanation).toContain("packaging or reel suffix");

    const rows = buildDuplicateComparisonRows(variant, refs);
    const mpnRow = rows.find((row) => row.label === "Manufacturer Part Number");
    expect(mpnRow!.emphasis).toBe("difference");
    expect(mpnRow!.note).toContain("packaging/reel suffix");
  });

  it("explains an MPN match under conflicting manufacturers", () => {
    const conflicting = buildFinding({
      issueType: "POTENTIAL_DUPLICATE",
      issueCategory: "DUPLICATE",
      relatedComponentId: "comp-related",
      component: {
        ...duplicateFinding.component!,
        manufacturerPartNumber: "RC0805FR-0727RL",
      },
      relatedComponent: {
        ...duplicateFinding.relatedComponent!,
        manufacturerPartNumber: "RC0805FR-0727RL",
        manufacturerId: "mfg-murata",
      },
      suggestedValue: { matchType: "MPN_MANUFACTURER_CONFLICT" },
    });

    const relationship = describeDuplicateRelationship(conflicting);
    expect(relationship.heading).toContain("manufacturer conflict");
    expect(relationship.explanation).toContain("different manufacturers");
    expect(relationship.explanation.toLowerCase()).not.toContain(
      "packaging suffix",
    );

    const rows = buildDuplicateComparisonRows(conflicting, refs);
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
    // The MPNs are identical; it is the manufacturer that disagrees.
    expect(byLabel["Manufacturer Part Number"]!.emphasis).toBe("match");
    expect(byLabel["Manufacturer"]!.emphasis).toBe("difference");
  });

  it("explains a name and attribute identity duplicate", () => {
    const identity = buildFinding({
      issueType: "POTENTIAL_DUPLICATE",
      issueCategory: "DUPLICATE",
      relatedComponentId: "comp-related",
      relatedComponent: {
        ...duplicateFinding.relatedComponent!,
        manufacturerPartNumber: null,
      },
      component: {
        ...duplicateFinding.component!,
        manufacturerPartNumber: null,
      },
      suggestedValue: {
        matchType: "NAME_ATTRIBUTE_IDENTITY",
        normalizedName: "10kohmsmdresistor0805",
        matchingAttributes: ["resistance", "package"],
      },
    });

    const relationship = describeDuplicateRelationship(identity);
    expect(relationship.heading).toContain("matching identity");
    expect(relationship.explanation).toContain("recorded specifications");

    const rows = buildDuplicateComparisonRows(identity, refs);
    const mpnRow = rows.find((row) => row.label === "Manufacturer Part Number");
    expect(mpnRow!.note).toContain("Not the duplicate signal");

    const entries = formatValueEntries(identity.suggestedValue);
    const labels = entries.map((entry) => entry.label);
    expect(labels).toContain("Normalized Name");
    expect(labels).toContain("Matching Attributes");
  });

  it("explains a semantic similarity duplicate with its score", () => {
    const semantic = buildFinding({
      issueType: "POTENTIAL_DUPLICATE",
      issueCategory: "DUPLICATE",
      relatedComponentId: "comp-related",
      relatedComponent: duplicateFinding.relatedComponent,
      suggestedValue: {
        matchType: "SEMANTIC_NAME_SIMILARITY",
        primaryMatchType: "SEMANTIC_NAME_SIMILARITY",
        similarityScore: 0.925,
        nameSimilarity: 1,
        sharedTokens: ["10kohm", "0805"],
        matchedSignals: ["MANUFACTURER_SAME", "CATEGORY_SAME"],
        penalizedSignals: [],
      },
      confidence: 0.925,
      confidenceLevel: "HIGH",
    });

    const relationship = describeDuplicateRelationship(semantic);
    expect(relationship.heading).toContain("similar records");
    expect(relationship.explanation).toContain("93%");
    expect(relationship.explanation).toContain("CMP-000871");
    expect(relationship.explanation.toLowerCase()).not.toContain("merge");
    expect(relationship.explanation.toLowerCase()).not.toContain("delete");

    const rows = buildDuplicateComparisonRows(semantic, refs);
    const mpnRow = rows.find((row) => row.label === "Manufacturer Part Number");
    expect(mpnRow!.note).toContain("overall similarity");

    const labels = formatValueEntries(semantic.suggestedValue).map(
      (entry) => entry.label,
    );
    expect(labels).toContain("Similarity Score");
    expect(labels).toContain("Name Similarity");
    expect(labels).toContain("Matched Signals");
    expect(labels).toContain("Primary Match Type");
  });

  it("surfaces capped similarity candidates in the audit summary", () => {
    const text = summarizeAuditResult({
      analyzedCount: 10,
      persistedCount: 2,
      staledCount: 0,
      duplicateFindingsCount: 2,
      failedCount: 0,
      notFoundCount: 0,
      batchLimitReached: false,
      duplicateFindingsTruncated: false,
      semanticCandidatesTruncated: true,
    });
    expect(text).toContain("similarity candidates were capped");
  });

  it("returns no comparison without both components", () => {
    expect(
      buildDuplicateComparisonRows({
        ...duplicateFinding,
        relatedComponent: null,
      }),
    ).toEqual([]);
  });

  it("does not offer merge or delete behaviour", () => {
    const relationship = describeDuplicateRelationship(duplicateFinding);
    expect(relationship.explanation.toLowerCase()).not.toContain("merge");
    expect(relationship.explanation.toLowerCase()).not.toContain("delete");
  });
});

describe("Component Review Queue audit summary", () => {
  it("summarizes a completed audit", () => {
    const text = summarizeAuditResult({
      analyzedCount: 25,
      persistedCount: 4,
      staledCount: 2,
      duplicateFindingsCount: 1,
      failedCount: 0,
      notFoundCount: 0,
      batchLimitReached: false,
      duplicateFindingsTruncated: false,
    });
    expect(text).toContain("Analyzed 25 components");
    expect(text).toContain("4 findings persisted");
    expect(text).toContain("2 marked stale");
    expect(text).not.toContain("Note:");
  });

  it("surfaces limits and failures explicitly", () => {
    const text = summarizeAuditResult({
      analyzedCount: 1,
      persistedCount: 0,
      staledCount: 0,
      duplicateFindingsCount: 0,
      failedCount: 3,
      notFoundCount: 1,
      batchLimitReached: true,
      duplicateFindingsTruncated: true,
    });
    expect(text).toContain("Analyzed 1 component");
    expect(text).toContain("1 not found");
    expect(text).toContain("3 failed");
    expect(text).toContain("batch limit reached");
    expect(text).toContain("capped");
  });
});

describe("Component Review Queue apply (writing suggestions)", () => {
  const duplicateFinding = buildFinding({
    issueType: "EXACT_DUPLICATE",
    issueCategory: "DUPLICATE",
    relatedComponentId: "comp-related",
  });

  const refs = {
    manufacturerNames: new Map([
      ["mfg-yageo", "Yageo"],
      ["mfg-murata", "Murata"],
    ]),
    categoryNames: new Map([
      ["cat-resistors", "Resistors"],
      ["cat-capacitors", "Capacitors"],
    ]),
  };

  describe("apply eligibility", () => {
    it.each([
      "MPN_MISSING",
      "MPN_CONFLICT",
      "MANUFACTURER_UNRESOLVED",
      "MANUFACTURER_CONFLICT",
      "CATEGORY_UNRESOLVED",
      "CATEGORY_CONFLICT",
    ])("offers Apply for %s", (issueType) => {
      const category = issueType.startsWith("CATEGORY")
        ? "CLASSIFICATION"
        : "IDENTITY";
      expect(
        canApplyFinding({
          status: "PENDING",
          issueCategory: category,
          issueType,
        }),
      ).toBe(true);
    });

    it("does not offer Apply for duplicate findings", () => {
      expect(canApplyFinding(duplicateFinding)).toBe(false);
      expect(
        canApplyFinding({
          status: "PENDING",
          issueCategory: "DUPLICATE",
          issueType: "EXACT_DUPLICATE",
        }),
      ).toBe(false);
    });

    it("does not offer Apply for findings that are not pending", () => {
      for (const status of [
        "ACCEPTED",
        "REJECTED",
        "DISMISSED",
        "STALE",
      ] as const) {
        expect(
          canApplyFinding({
            status,
            issueCategory: "IDENTITY",
            issueType: "MPN_MISSING",
          }),
        ).toBe(false);
      }
    });
  });

  describe("apply permission gating", () => {
    const applicableFinding = {
      status: "PENDING" as const,
      issueCategory: "IDENTITY",
      issueType: "MPN_MISSING",
    };

    it("reuses the existing component-write permission", () => {
      // Mirrors the backend guard's COMPONENT_WRITE_PERMISSION.
      expect(COMPONENT_WRITE_PERMISSION).toBe("Inventory.Update");
      expect(MAX_QUEUE_PAGE_SIZE).toBe(100);
    });

    it("offers Apply only when the user may modify component data", () => {
      expect(canApplyFindingAsUser(applicableFinding, true)).toBe(true);
      expect(canApplyFindingAsUser(applicableFinding, false)).toBe(false);
    });

    it("keeps duplicate findings unavailable regardless of permission", () => {
      expect(canApplyFindingAsUser(duplicateFinding, true)).toBe(false);
    });

    it("keeps decided findings unavailable regardless of permission", () => {
      for (const status of [
        "ACCEPTED",
        "REJECTED",
        "DISMISSED",
        "STALE",
      ] as const) {
        expect(
          canApplyFindingAsUser(
            { status, issueCategory: "IDENTITY", issueType: "MPN_MISSING" },
            true,
          ),
        ).toBe(false);
      }
    });

    it("explains that the component is not modified for duplicates", () => {
      const reason = applyUnavailableReason(duplicateFinding, true);
      expect(reason).toMatch(/review-only/i);
    });

    it("explains the missing permission and that review is still possible", () => {
      const reason = applyUnavailableReason(applicableFinding, false);
      expect(reason).toContain("Inventory.Update");
      expect(reason).toMatch(/accept or reject/i);
    });

    it("reports no reason when the action is available", () => {
      expect(applyUnavailableReason(applicableFinding, true)).toBeNull();
    });

    /**
     * Review-only attribute findings.
     *
     * Both are absent from the backend's applicable set, so offering Apply on
     * one produced a guaranteed 409 — a control that cannot work. The reason
     * states why, because "no button" without an explanation reads as a bug.
     */
    it("does not offer Apply for a specification with no determined value", () => {
      const unknownValue = {
        status: "PENDING" as const,
        issueCategory: "ATTRIBUTE_VALUE",
        issueType: "ATTRIBUTE_VALUE_UNKNOWN",
      };

      expect(canApplyFinding(unknownValue)).toBe(false);
      expect(canApplyFindingAsUser(unknownValue, true)).toBe(false);
      expect(applyUnavailableReason(unknownValue, true)).toMatch(
        /nothing to apply/i,
      );
    });

    it("does not offer Apply for a document conflict", () => {
      const conflict = {
        status: "PENDING" as const,
        issueCategory: "ATTRIBUTE_VALUE",
        issueType: "DOCUMENT_CONFLICT",
      };

      expect(canApplyFinding(conflict)).toBe(false);
      expect(applyUnavailableReason(conflict, true)).toMatch(
        /will not pick one/i,
      );
    });

    it("still offers Apply for a specification that carries a value", () => {
      const suggestion = {
        status: "PENDING" as const,
        issueCategory: "ATTRIBUTE_VALUE",
        issueType: "ATTRIBUTE_VALUE_SUGGESTION",
      };

      expect(canApplyFinding(suggestion)).toBe(true);
      expect(applyUnavailableReason(suggestion, true)).toBeNull();
    });
  });

  describe("review write permissions", () => {
    it("grants every write capability from the single component-write permission", () => {
      const granted = deriveReviewPermissions(true);
      expect(granted).toEqual({
        canDecide: true,
        canApply: true,
        canAudit: true,
        isReadOnly: false,
      });
    });

    it("makes the whole queue read-only without the permission", () => {
      const none = deriveReviewPermissions(false);
      expect(none.canDecide).toBe(false);
      expect(none.canApply).toBe(false);
      expect(none.canAudit).toBe(false);
      expect(none.isReadOnly).toBe(true);
    });

    it("describes read-only access without hiding the queue", () => {
      const notice = reviewReadOnlyNotice();
      expect(notice).toContain("Inventory.Update");
      expect(notice).toMatch(/review findings and their evidence/i);
    });

    it("explains why a manual audit is unavailable", () => {
      expect(auditUnavailableReason(true)).toBeNull();
      expect(auditUnavailableReason(false)).toContain("Inventory.Update");
    });

    it("reuses one permission constant for every capability", () => {
      // No parallel vocabulary: the same constant gates read-only messaging,
      // apply gating, and the audit reason.
      for (const copy of [
        reviewReadOnlyNotice(),
        auditUnavailableReason(false),
        applyUnavailableReason(
          {
            status: "PENDING",
            issueCategory: "IDENTITY",
            issueType: "MPN_MISSING",
          },
          false,
        ),
      ]) {
        expect(copy).toContain(COMPONENT_WRITE_PERMISSION);
      }
    });
  });

  describe("apply confirmation content", () => {
    it("shows the component, field, current value, and new value", () => {
      const rows = buildApplyConfirmationRows(buildFinding(), refs);
      const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));

      expect(byLabel["Component"]!.value).toBe("27 Ohm Chip Resistor");
      expect(byLabel["Internal SKU"]!.value).toBe("CMP-000421");
      expect(byLabel["Field"]!.value).toBe("Manufacturer Part Number");
      expect(byLabel["Current"]!.value).toBe("RC0805FR-0710RL");
      expect(byLabel["New"]!.value).toBe("RC0805FR-0727RL");
      // The new value is the emphasised row.
      expect(byLabel["New"]!.emphasis).toBe(true);
      expect(byLabel["Current"]!.emphasis).toBe(false);
    });

    it("resolves manufacturer names for entity findings", () => {
      const rows = buildApplyConfirmationRows(
        buildFinding({
          issueType: "MANUFACTURER_CONFLICT",
          component: {
            ...buildFinding().component!,
            manufacturerId: "mfg-murata",
          },
          suggestedValue: { manufacturerId: "mfg-yageo" },
        }),
        refs,
      );
      const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
      expect(byLabel["Field"]!.value).toBe("Manufacturer");
      expect(byLabel["Current"]!.value).toBe("Murata");
      // A reassignable finding states the model's proposal as a suggestion, so
      // it is not the row describing what will be written.
      expect(byLabel["Suggested"]!.value).toBe("Yageo");
      expect(byLabel["Suggested"]!.emphasis).toBe(false);
      expect(byLabel["New"]).toBeUndefined();
    });

    it("resolves category names and shows 'Not set' for unresolved fields", () => {
      const rows = buildApplyConfirmationRows(
        buildFinding({
          issueType: "CATEGORY_UNRESOLVED",
          issueCategory: "CLASSIFICATION",
          component: { ...buildFinding().component!, categoryId: null },
          suggestedValue: {
            categoryId: "cat-resistors",
            categoryName: "Resistors",
          },
        }),
        refs,
      );
      const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
      expect(byLabel["Field"]!.value).toBe("Category");
      expect(byLabel["Current"]!.value).toBe("Not set");
      expect(byLabel["Suggested"]!.value).toBe("Resistors");
    });

    it("adds the assignment as the written row when the reviewer edited it", () => {
      const rows = buildApplyConfirmationRows(
        buildFinding({
          issueType: "MANUFACTURER_CONFLICT",
          suggestedValue: { manufacturerId: "mfg-yageo" },
        }),
        refs,
        { assignedLabel: "Vishay" },
      );
      const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));

      expect(byLabel["Suggested"]!.value).toBe("Yageo");
      expect(byLabel["Suggested"]!.emphasis).toBe(false);
      expect(byLabel["Assigning"]!.value).toBe("Vishay");
      expect(byLabel["Assigning"]!.emphasis).toBe(true);
      expect(byLabel["Assigning"]!.kind).toBe("assigned");
    });

    it("keeps the suggested row emphasised for findings that cannot be reassigned", () => {
      const rows = buildApplyConfirmationRows(buildFinding(), refs);
      const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));

      expect(byLabel["New"]!.emphasis).toBe(true);
      expect(byLabel["New"]!.kind).toBe("suggested");
    });

    it("warns that the component will be updated", () => {
      expect(APPLY_WARNING).toMatch(/will update the component/i);
    });

    it("explains that duplicate findings are review-only", () => {
      expect(APPLY_DUPLICATE_NOTE).toMatch(/review-only/i);
      expect(APPLY_DUPLICATE_NOTE).toMatch(/does not merge or delete/i);
      expect(APPLY_REVIEW_ONLY_COPY.description).toMatch(
        /component is not modified/i,
      );
    });
  });

  describe("apply request shape", () => {
    it("sends only the fingerprint and notes", () => {
      const payload = buildApplyPayload(
        buildFinding(),
        "  verified against datasheet  ",
      );
      expect(Object.keys(payload).sort()).toEqual([
        "decisionNotes",
        "expectedFingerprint",
      ]);
      expect(payload.expectedFingerprint).toBe("fingerprint-1");
      expect(payload.decisionNotes).toBe("verified against datasheet");
    });

    it("omits blank notes", () => {
      expect(Object.keys(buildApplyPayload(buildFinding(), "   "))).toEqual([
        "expectedFingerprint",
      ]);
    });

    it("never sends a field or value mutation", () => {
      const serialized = JSON.stringify(buildApplyPayload(buildFinding()));
      for (const forbidden of [
        "field",
        "value",
        "manufacturerId",
        "categoryId",
        "manufacturerPartNumber",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });

    it("sends the assigned row when the reviewer corrected the suggestion", () => {
      const payload = buildApplyPayload(
        buildFinding(),
        "Yageo is the MPN owner",
        "mfg-vishay",
      );

      expect(Object.keys(payload).sort()).toEqual([
        "decisionNotes",
        "expectedFingerprint",
        "targetEntityId",
      ]);
      expect(payload.targetEntityId).toBe("mfg-vishay");
    });

    it("omits a blank assignment", () => {
      expect(
        Object.keys(buildApplyPayload(buildFinding(), undefined, "  ")),
      ).toEqual(["expectedFingerprint"]);
      expect(
        Object.keys(buildApplyPayload(buildFinding(), undefined, null)),
      ).toEqual(["expectedFingerprint"]);
    });
  });

  describe("manufacturer and category assignment", () => {
    it("offers reassignment only for the two entity families", () => {
      expect(
        applyAssignableEntity({ issueType: "MANUFACTURER_UNRESOLVED" }),
      ).toBe("manufacturer");
      expect(
        applyAssignableEntity({ issueType: "MANUFACTURER_CONFLICT" }),
      ).toBe("manufacturer");
      expect(applyAssignableEntity({ issueType: "CATEGORY_UNRESOLVED" })).toBe(
        "category",
      );
      expect(applyAssignableEntity({ issueType: "CATEGORY_CONFLICT" })).toBe(
        "category",
      );
      for (const issueType of [
        "MPN_MISSING",
        "MPN_CONFLICT",
        "ATTRIBUTE_VALUE_SUGGESTION",
        "EXACT_DUPLICATE",
        "POTENTIAL_DUPLICATE",
      ]) {
        expect(applyAssignableEntity({ issueType })).toBeNull();
      }
    });

    it("reads the suggestion from the finding snapshot, without a lookup", () => {
      const suggestion = suggestedEntityAssignment(
        buildFinding({
          issueType: "MANUFACTURER_CONFLICT",
          suggestedValue: {
            manufacturerId: "mfg-yageo",
            manufacturerName: "Yageo",
            resolution: "EXISTING",
          },
        }),
      );

      expect(suggestion).toEqual({
        id: "mfg-yageo",
        label: "Yageo",
        resolution: "EXISTING",
      });
    });

    it("reports a suggested name the ERP does not hold yet", () => {
      const finding = buildFinding({
        issueType: "MANUFACTURER_UNRESOLVED",
        suggestedValue: {
          manufacturerId: null,
          manufacturerName: "Yageo",
          resolution: "NEW_CANDIDATE",
        },
      });
      const suggestion = suggestedEntityAssignment(finding);

      expect(suggestion).toEqual({
        id: null,
        label: "Yageo",
        resolution: "NEW_CANDIDATE",
      });
      expect(applyAssignmentHint(finding)).toMatch(/not in the ERP yet/i);
      expect(applyAssignmentHint(finding)).toMatch(/create it/i);
    });

    it("has no hint when the suggestion can be applied as it stands", () => {
      const finding = buildFinding({
        issueType: "CATEGORY_CONFLICT",
        suggestedValue: {
          categoryId: "cat-resistors",
          categoryName: "Resistors",
        },
      });

      expect(applyAssignmentHint(finding)).toBeNull();
      expect(suggestedEntityAssignment(finding)?.resolution).toBe("UNKNOWN");
    });

    it("has nothing to assign for a finding that carries its own value", () => {
      expect(suggestedEntityAssignment(buildFinding())).toBeNull();
      expect(applyAssignmentHint(buildFinding())).toBeNull();
    });

    it("labels the control with the entity being assigned", () => {
      expect(
        applyAssignmentFieldLabel({ issueType: "CATEGORY_UNRESOLVED" }),
      ).toBe("Assign Category");
      expect(
        applyAssignmentFieldLabel({ issueType: "MANUFACTURER_UNRESOLVED" }),
      ).toBe("Assign Manufacturer");
    });

    it("switches the action label only when the assignment is an edit", () => {
      const finding = { issueType: "MANUFACTURER_CONFLICT" };

      expect(applyActionCopy(finding, false)).toEqual(APPLY_COPY);
      expect(applyActionCopy(finding, true)).toEqual(ASSIGN_COPY);
      expect(ASSIGN_COPY.label).toBe("Assign & Apply");
      // A non-entity finding can never claim the assignment wording.
      expect(applyActionCopy({ issueType: "MPN_CONFLICT" }, true)).toEqual(
        APPLY_COPY,
      );
    });

    it("warns that the assignment, not the suggestion, is written", () => {
      expect(ASSIGN_WARNING).toMatch(/not the suggested one/i);
      expect(ASSIGN_WARNING).toMatch(/recorded as an edit/i);
      expect(ASSIGN_WARNING).not.toBe(APPLY_WARNING);
    });
  });

  describe("assignment dialog wiring", () => {
    const webRoot = path.resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "..",
    );
    const applyDialog = fs.readFileSync(
      path.join(
        webRoot,
        "components/components/component-review-apply-dialog.tsx",
      ),
      "utf8",
    );

    it("reuses the component form's entity dropdown for the assignment", () => {
      expect(applyDialog).toContain("EntitySelector");
      expect(applyDialog).toContain("entity={assignable}");
      expect(applyDialog).toContain("creatable");
      expect(applyDialog).toContain("canCreate={canCreate}");
    });

    it("sends the assignment only when it replaced the suggestion", () => {
      expect(applyDialog).toContain(
        "assignmentEdited && effectiveId ? effectiveId : undefined",
      );
    });

    it("keeps the suggestion visible while it is being edited", () => {
      expect(applyDialog).toContain("suggestedEntityAssignment(finding, refs)");
      expect(applyDialog).toContain("assignedLabel: assignmentEdited");
    });
  });

  describe("apply outcome messaging", () => {
    it("reports the applied field and value", () => {
      const message = applySuccessMessage({
        fieldLabel: "Manufacturer Part Number",
        appliedValue: "RC0805FR-0727RL",
        appliedValueLabel: null,
        staledFindingCount: 0,
        assignmentEdited: false,
        suggestedTarget: null,
      });
      expect(message).toContain("RC0805FR-0727RL");
      expect(message).toContain("accepted");
    });

    it("reports reconciled sibling findings", () => {
      const message = applySuccessMessage({
        fieldLabel: "Category",
        appliedValue: "cat-1",
        appliedValueLabel: "Resistors",
        staledFindingCount: 2,
        assignmentEdited: false,
        suggestedTarget: null,
      });
      expect(message).toContain("Resistors");
      expect(message).toContain("2 other findings");
    });

    it("says an assignment replaced the suggestion and was recorded as an edit", () => {
      const message = applySuccessMessage({
        fieldLabel: "Manufacturer",
        appliedValue: "mfg-vishay",
        appliedValueLabel: "Vishay",
        staledFindingCount: 0,
        assignmentEdited: true,
        suggestedTarget: { id: "mfg-yageo", name: "Yageo" },
      });

      expect(message).toContain("Vishay");
      expect(message).toContain('instead of the suggested "Yageo"');
      expect(message).toMatch(/recorded as an edit/i);
      expect(message).not.toMatch(
        /suggested value\. The finding is now accepted/,
      );
    });

    it("still names the edit when the finding had no suggestion to quote", () => {
      const message = applySuccessMessage({
        fieldLabel: "Manufacturer",
        appliedValue: "mfg-vishay",
        appliedValueLabel: "Vishay",
        staledFindingCount: 0,
        assignmentEdited: true,
        suggestedTarget: { id: null, name: null },
      });

      expect(message).toContain("instead of the suggestion");
    });

    it.each([
      ["COMPONENT_CHANGED", /was not applied/i],
      ["FINGERPRINT_MISMATCH", /was not applied/i],
      ["FINDING_NOT_PENDING", /was not modified/i],
      ["SUGGESTED_ENTITY_NOT_FOUND", /no longer exists/i],
      ["SUGGESTED_ENTITY_INACTIVE", /inactive/i],
      ["INVALID_SUGGESTED_VALUE", /not valid/i],
      ["UNSUPPORTED_FINDING_TYPE", /review-only/i],
    ] as const)(
      "explains %s and confirms nothing changed",
      (reason, pattern) => {
        expect(applyConflictMessage(reason)).toMatch(pattern);
      },
    );

    it("reports the component-changed conflict as required", () => {
      expect(applyConflictMessage("COMPONENT_CHANGED")).toBe(
        "The component changed after this finding was generated. The suggestion was not applied.",
      );
    });

    it("falls back to the API message for unknown reasons", () => {
      expect(applyConflictMessage(null, "Server said no")).toBe(
        "Server said no",
      );
      expect(applyConflictMessage(null)).toMatch(/could not be applied/i);
    });
  });

  describe("conflict reason extraction", () => {
    it("reads the machine-readable reason from the error body", () => {
      expect(extractApplyConflictReason({ reason: "COMPONENT_CHANGED" })).toBe(
        "COMPONENT_CHANGED",
      );
      expect(
        extractApplyConflictReason({
          statusCode: 409,
          reason: "FINDING_NOT_PENDING",
        }),
      ).toBe("FINDING_NOT_PENDING");
    });

    it("ignores unknown or malformed bodies", () => {
      expect(
        extractApplyConflictReason({ reason: "SOMETHING_ELSE" }),
      ).toBeNull();
      expect(extractApplyConflictReason("COMPONENT_CHANGED")).toBeNull();
      expect(extractApplyConflictReason(null)).toBeNull();
      expect(extractApplyConflictReason(undefined)).toBeNull();
    });
  });

  describe("API surface", () => {
    it("exposes apply without exposing component mutation", () => {
      expect(Object.keys(componentReviewQueueApi)).toContain("applyFinding");
      const serialized = Object.keys(componentReviewQueueApi).join(" ");
      for (const forbidden of [
        "create",
        "update",
        "delete",
        "merge",
        "patch",
      ]) {
        expect(serialized.toLowerCase()).not.toContain(forbidden);
      }
    });

    it("caps page size at the backend ceiling", () => {
      expect(MAX_QUEUE_PAGE_SIZE).toBe(100);
    });
  });
});

// ---------------------------------------------------------------------------
// Header counter chip
// ---------------------------------------------------------------------------

describe("Component Review Queue header counter", () => {
  it("counts pending and stale findings as outstanding review work", () => {
    expect(actionableFindingCount({ pending: 7, stale: 2 })).toBe(9);
  });

  it("excludes resolved findings so the counter falls as work is completed", () => {
    expect(actionableFindingCount({ pending: 0, stale: 0 })).toBe(0);
  });

  it("treats a missing summary as an empty queue instead of throwing", () => {
    expect(actionableFindingCount(null)).toBe(0);
  });

  it("reports the live queue shape as an actionable backlog", () => {
    // Mirrors the queue after an audit whose findings have partly been resolved.
    expect(actionableFindingCount({ pending: 0, stale: 1 })).toBe(1);
    expect(
      actionableFindingCount({
        pending: summary.pending,
        stale: summary.stale,
      }),
    ).toBe(8);
  });

  it("keeps the chip hidden only when nothing is outstanding", () => {
    // The chip renders when the count is positive, exactly like the Attribute
    // Library header.
    expect(actionableFindingCount({ pending: 0, stale: 0 }) > 0).toBe(false);
    expect(actionableFindingCount({ pending: 1, stale: 0 }) > 0).toBe(true);
    expect(actionableFindingCount({ pending: 0, stale: 1 }) > 0).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Queue tabs
// ---------------------------------------------------------------------------

describe("Component Review Queue tabs", () => {
  it("offers the same tab order and shape as the Attribute queue", () => {
    expect(QUEUE_TABS.map((tab) => tab.id)).toEqual([
      "ALL",
      "IDENTITY",
      "CLASSIFICATION",
      "ATTRIBUTES",
      "DUPLICATES",
      "STALE",
    ]);
    expect(QUEUE_TABS[0]?.label).toBe("All");
    expect(QUEUE_TABS.every((tab) => tab.label.length > 0)).toBe(true);
  });

  it("groups findings by issue category", () => {
    const identity = buildFinding({ issueCategory: "IDENTITY" });
    const classification = buildFinding({ issueCategory: "CLASSIFICATION" });
    const attributeValue = buildFinding({ issueCategory: "ATTRIBUTE_VALUE" });
    const duplicate = buildFinding({ issueCategory: "DUPLICATE" });

    expect(matchesQueueTab(identity, "ALL")).toBe(true);
    expect(matchesQueueTab(identity, "IDENTITY")).toBe(true);
    expect(matchesQueueTab(identity, "CLASSIFICATION")).toBe(false);
    expect(matchesQueueTab(classification, "CLASSIFICATION")).toBe(true);
    expect(matchesQueueTab(attributeValue, "ATTRIBUTES")).toBe(true);
    expect(matchesQueueTab(attributeValue, "IDENTITY")).toBe(false);
    expect(matchesQueueTab(duplicate, "DUPLICATES")).toBe(true);
  });

  it("groups stale findings independently of their category", () => {
    const staleClassification = buildFinding({
      issueCategory: "CLASSIFICATION",
      status: "STALE",
    });

    expect(matchesQueueTab(staleClassification, "STALE")).toBe(true);
    expect(matchesQueueTab(staleClassification, "CLASSIFICATION")).toBe(true);
    expect(matchesQueueTab(buildFinding(), "STALE")).toBe(false);
  });

  it("counts every tab from the loaded findings", () => {
    // The list is fetched whole (no page size), so counting the loaded rows is
    // complete — and it is what makes a tab's number match what clicking it shows.
    const items = [
      buildFinding({ id: "a", issueCategory: "IDENTITY" }),
      buildFinding({ id: "b", issueCategory: "CLASSIFICATION" }),
      buildFinding({
        id: "c",
        issueCategory: "CLASSIFICATION",
        status: "STALE",
      }),
      buildFinding({ id: "d", issueCategory: "DUPLICATE" }),
      buildFinding({ id: "e", issueCategory: "ATTRIBUTE_VALUE" }),
    ];

    expect(buildQueueTabCounts(items)).toEqual({
      ALL: 5,
      IDENTITY: 1,
      CLASSIFICATION: 2,
      ATTRIBUTES: 1,
      DUPLICATES: 1,
      STALE: 1,
    });
  });

  it("reports zero for every tab on an empty list", () => {
    expect(buildQueueTabCounts([])).toEqual({
      ALL: 0,
      IDENTITY: 0,
      CLASSIFICATION: 0,
      ATTRIBUTES: 0,
      DUPLICATES: 0,
      STALE: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Finding cards
// ---------------------------------------------------------------------------

const relatedComponent = {
  id: "comp-related",
  sku: "CMP-000422",
  name: "27 Ohm Chip Resistor (duplicate)",
  manufacturerPartNumber: "RC0805FR-0710RL",
  manufacturerId: "mfg-yageo",
  categoryId: "cat-resistors",
  unit: "pcs",
  isActive: true,
};

describe("Component Review Queue card summary", () => {
  it("shows the field and the current to suggested values", () => {
    const card = buildFindingValueSummary(buildFinding());

    expect(card.fieldLabel).toBe("Manufacturer Part Number");
    expect(card.current).toBe("RC0805FR-0710RL");
    expect(card.suggested).toBe("RC0805FR-0727RL");
    expect(card.relatedSku).toBeNull();
  });

  it("agrees with the apply confirmation for the same finding", () => {
    const finding = buildFinding();
    const card = buildFindingValueSummary(finding);
    const rows = buildApplyConfirmationRows(finding);
    const rowValue = (label: string) =>
      rows.find((row) => row.label === label)?.value;

    expect(card.current).toBe(rowValue("Current"));
    expect(card.suggested).toBe(rowValue("New"));
    expect(card.fieldLabel).toBe(rowValue("Field"));
  });

  it("compares both components for duplicate findings", () => {
    const card = buildFindingValueSummary(
      buildFinding({
        issueCategory: "DUPLICATE",
        issueType: "EXACT_DUPLICATE",
        relatedComponentId: relatedComponent.id,
        relatedComponent,
      }),
    );

    expect(card.fieldLabel).toBeNull();
    expect(card.current).toBe("RC0805FR-0710RL");
    expect(card.suggested).toBe("RC0805FR-0710RL");
    expect(card.relatedSku).toBe("CMP-000422");
  });

  it("resolves reference names instead of leaking identifiers", () => {
    const finding = buildFinding({
      issueType: "CATEGORY_UNRESOLVED",
      issueCategory: "CLASSIFICATION",
      suggestedValue: { categoryId: "cat-capacitors" },
    });

    const card = buildFindingValueSummary(finding, {
      categoryNames: new Map([
        ["cat-resistors", "Resistors"],
        ["cat-capacitors", "Capacitors"],
      ]),
    });

    expect(card.fieldLabel).toBe("Category");
    expect(card.current).toBe("Resistors");
    expect(card.suggested).toBe("Capacitors");
  });

  it("shows 'Not set' rather than inventing a current value", () => {
    const card = buildFindingValueSummary(
      buildFinding({
        issueType: "MPN_MISSING",
        component: {
          ...buildFinding().component!,
          manufacturerPartNumber: null,
        },
      }),
    );

    expect(card.current).toBe("Not set");
  });
});

describe("Component Review Queue card actions", () => {
  const reader = deriveReviewPermissions(false);
  const reviewer = deriveReviewPermissions(true);
  const inspectionOnly = ["EVIDENCE", "INSPECT", "OPEN_COMPONENT"];

  it("gives read-only reviewers inspection actions only", () => {
    expect(queueCardActions(buildFinding(), reader)).toEqual(inspectionOnly);
  });

  it("offers apply and reject to writers on a pending finding", () => {
    expect(queueCardActions(buildFinding(), reviewer)).toEqual([
      ...inspectionOnly,
      "REJECT",
      "APPLY",
    ]);
  });

  it("never offers apply for duplicate findings", () => {
    const actions = queueCardActions(
      buildFinding({
        issueCategory: "DUPLICATE",
        issueType: "EXACT_DUPLICATE",
        relatedComponentId: relatedComponent.id,
        relatedComponent,
      }),
      reviewer,
    );

    expect(actions).toEqual([...inspectionOnly, "REJECT"]);
    expect(actions).not.toContain("APPLY");
    expect(actions).not.toContain("ACCEPT");
  });

  it("lets writers close a stale finding but never apply it", () => {
    const actions = queueCardActions(
      buildFinding({ status: "STALE" }),
      reviewer,
    );

    expect(actions).toEqual([...inspectionOnly, "REJECT", "ACCEPT"]);
    expect(actions).not.toContain("APPLY");
  });

  it("hides every write action once a finding is resolved", () => {
    for (const status of ["ACCEPTED", "REJECTED", "DISMISSED"] as const) {
      expect(queueCardActions(buildFinding({ status }), reviewer)).toEqual(
        inspectionOnly,
      );
    }
  });

  it("keeps the queue inspectable when the permission is missing", () => {
    for (const status of ["PENDING", "STALE", "ACCEPTED"] as const) {
      const actions = queueCardActions(buildFinding({ status }), reader);
      expect(actions).toEqual(inspectionOnly);
      expect(actions).toContain("EVIDENCE");
    }
  });

  it("gates every write action on the single component-write permission", () => {
    expect(deriveReviewPermissions(true).canDecide).toBe(true);
    expect(deriveReviewPermissions(false).canDecide).toBe(false);
    expect(COMPONENT_WRITE_PERMISSION).toBe("Inventory.Update");
  });
});

// ---------------------------------------------------------------------------
// Modal consolidation and route removal
// ---------------------------------------------------------------------------

describe("Component Review Queue modal consolidation", () => {
  const webRoot = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "..",
  );
  const read = (relativePath: string) =>
    fs.readFileSync(path.join(webRoot, relativePath), "utf8");

  it("no longer ships the standalone review queue route", () => {
    expect(
      fs.existsSync(path.join(webRoot, "app/components/review-queue")),
    ).toBe(false);
  });

  it("opens the queue as a modal from the Components page", () => {
    const page = read("app/components/page.tsx");

    expect(page).toContain("ComponentReviewQueueDialog");
    expect(page).not.toContain("/components/review-queue");
  });

  it("keeps no navigation entry pointing at the removed route", () => {
    const navigation = read("lib/navigation/navigation-config.tsx");

    expect(navigation).not.toContain("/components/review-queue");
  });

  it("renders the same header counter chip as the Attribute Library", () => {
    const chipClass = (source: string) =>
      source.match(/ml-1 inline-flex[^"]*rounded-full[^"]*/)?.[0] ?? null;

    const componentsChip = chipClass(read("app/components/page.tsx"));
    const attributesChip = chipClass(read("app/attributes/page.tsx"));

    expect(componentsChip).not.toBeNull();
    expect(componentsChip).toBe(attributesChip);
  });

  it("reads the counter from the shared summary instead of recounting", () => {
    const page = read("app/components/page.tsx");

    expect(page).toContain("actionableFindingCount");
    expect(page).toContain("componentReviewQueueApi");
  });

  it("keeps the reusable client, helpers, and dialogs the modal needs", () => {
    for (const file of [
      "lib/api/component-review-queue-api.ts",
      "lib/component-review-queue.ts",
      "components/components/component-review-queue-dialog.tsx",
      "components/components/component-review-queue-finding-dialog.tsx",
      "components/components/component-review-apply-dialog.tsx",
    ]) {
      expect(fs.existsSync(path.join(webRoot, file))).toBe(true);
    }
  });

  it("leaves the Attribute Intelligence Review queue untouched", () => {
    expect(
      fs.existsSync(
        path.join(
          webRoot,
          "components/attributes/attribute-review-queue-dialog.tsx",
        ),
      ),
    ).toBe(true);
    expect(read("app/attributes/page.tsx")).toContain(
      "AttributeReviewQueueDialog",
    );
  });
});

// ---------------------------------------------------------------------------
// Dialog header
// ---------------------------------------------------------------------------

describe("Intelligence queue dialog header", () => {
  const webRoot = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "..",
  );
  const read = (relativePath: string) =>
    fs.readFileSync(path.join(webRoot, relativePath), "utf8");

  const queueDialogs = [
    "components/components/component-review-queue-dialog.tsx",
    "components/attributes/attribute-review-queue-dialog.tsx",
  ];

  /**
   * Longest description that still fits on one line in the rich header.
   *
   * Measured against the built stylesheet at `size="lg"` (896px): the
   * description gets 462px for the Component queue and 488px for the Attribute
   * queue, and the shipped copy needs 411px and 448px respectively. 72
   * characters stays inside that budget with room to spare.
   */
  const SINGLE_LINE_BUDGET = 72;

  const descriptionOf = (source: string) =>
    source.match(/description="([^"]+)"/)?.[1] ?? null;

  it("keeps every queue description short enough for a single line", () => {
    for (const dialog of queueDialogs) {
      const description = descriptionOf(read(dialog));

      expect(description, dialog).not.toBeNull();
      expect(description!.length, dialog).toBeLessThanOrEqual(
        SINGLE_LINE_BUDGET,
      );
    }
  });

  it("still describes the queue after shortening", () => {
    const component = descriptionOf(read(queueDialogs[0]!));
    const attribute = descriptionOf(read(queueDialogs[1]!));

    expect(component).toMatch(/supervised ai/i);
    expect(attribute).toMatch(/supervised ai/i);
  });

  it("centres the close button without fighting Button's press transform", () => {
    const shell = read("components/ui/dialog-shell.tsx");
    const button = read("components/ui/button.tsx");

    // Comments may name the rejected utility to explain the choice, so only
    // the live code is inspected.
    const codeOnly = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    // Button nudges itself on press by writing `--tw-translate-y`. Centring the
    // close button with `-translate-y-1/2` would overwrite that same variable
    // and drop the button by half its height (measured: a 17px jump), so the
    // centring must not use translate at all.
    expect(button).toContain("active:not-aria-[haspopup]:translate-y-px");
    expect(codeOnly(shell)).toContain("inset-y-0 my-auto");
    expect(codeOnly(shell)).not.toContain("-translate-y-1/2");

    // The plain header keeps its original top-right position.
    expect(shell).toContain('"top-4"');
  });

  it("renders the icon and audit actions through the shared header slot", () => {
    for (const dialog of queueDialogs) {
      const source = read(dialog);

      expect(source, dialog).toContain("icon={<Sparkles");
      expect(source, dialog).toContain("headerActions={");
    }
  });
});

// ---------------------------------------------------------------------------
// Filter section layout
// ---------------------------------------------------------------------------

describe("Intelligence queue filter section", () => {
  const webRoot = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "..",
  );
  const read = (relativePath: string) =>
    fs.readFileSync(path.join(webRoot, relativePath), "utf8");

  const queueDialogs = [
    "components/components/component-review-queue-dialog.tsx",
    "components/attributes/attribute-review-queue-dialog.tsx",
  ];

  /** The shared two-row container class, byte-identical in both dialogs. */
  const FILTER_CONTAINER =
    "space-y-2 rounded-xl border border-border bg-card p-3";

  it("stacks the filter section into two rows in both queues", () => {
    for (const dialog of queueDialogs) {
      const source = read(dialog);

      expect(source, dialog).toContain(FILTER_CONTAINER);
      // The old single-row layout collapsed the search box on wide screens.
      expect(source, dialog).not.toContain("lg:flex-row");
    }
  });

  it("puts the search box on the first row at full width", () => {
    for (const dialog of queueDialogs) {
      const source = read(dialog);
      const container = source.indexOf(FILTER_CONTAINER);
      const firstChild = source.slice(container, container + 220);

      // A block wrapper (`relative`) without `flex-1`, so the input fills the
      // row instead of being squeezed beside the selects.
      expect(firstChild, dialog).toContain('<div className="relative">');
      expect(firstChild, dialog).not.toContain("relative flex-1");
    }
  });

  it("puts the filter controls on the second row behind the filter icon", () => {
    for (const dialog of queueDialogs) {
      const source = read(dialog);
      const container = source.indexOf(FILTER_CONTAINER);
      const controls = source.indexOf(
        "flex flex-wrap items-center gap-2",
        container,
      );

      expect(controls, dialog).toBeGreaterThan(container);
      // The icon carries horizontal spacing so it does not crowd the selects.
      expect(source.slice(controls, controls + 140), dialog).toContain(
        'className="mx-1.5 size-3.5 text-muted-foreground"',
      );
    }
  });

  it("gives every filter select the same flexible width", () => {
    for (const dialog of queueDialogs) {
      const source = read(dialog);
      // Only the filter selects, not the header's Refresh/Audit buttons.
      const triggers = [
        ...source.matchAll(/<SelectTrigger\s+className="([^"]+)"/g),
      ].map((match) => match[1]!);

      expect(triggers.length, dialog).toBeGreaterThan(0);
      for (const trigger of triggers) {
        expect(trigger, dialog).toContain("flex-1");
        expect(trigger, dialog).toContain("min-w-[140px]");
      }
      // One shared class means the selects cannot drift to different widths.
      expect(new Set(triggers).size, dialog).toBe(1);
    }
  });

  it("no longer pins the selects to per-filter fixed widths", () => {
    for (const dialog of queueDialogs) {
      const source = read(dialog);

      // A bare `w-[140px]`/`w-[180px]` would defeat the equal-width rule.
      expect(source, dialog).not.toMatch(/[^n]-w-\[1[48]0px\]/);
    }
  });

  it("gives both queues a searchable, filterable list", () => {
    const component = read(queueDialogs[0]!);
    const attribute = read(queueDialogs[1]!);

    // Search is wired in both.
    expect(component).toContain("setSearchInput");
    expect(attribute).toContain("setSearchInput");

    // Both offer a confidence filter. The Component queue groups the loaded list
    // by tab; the Attribute queue applies its tab as a server-side filter. Either
    // way the list is fetched whole, so both see every match.
    expect(component).toContain("confidenceFilter");
    expect(attribute).toContain("confidenceFilter");
    expect(attribute).toContain("attributeReviewQueueApi.listFindings");
    // One request returns the whole filtered list: no page parameters at all.
    expect(attribute).not.toContain("pageNumber");
    expect(attribute).not.toContain("pageSize:");
    expect(component).not.toContain("pageSize:");
    // No client-side filtering remains in the Attribute queue.
    expect(attribute).not.toContain(
      "item.confidenceLevel !== confidenceFilter",
    );
  });

  it("offers a clear action that resets every filter", () => {
    for (const dialog of queueDialogs) {
      const source = read(dialog);

      expect(source, dialog).toContain("clearFilters");
      // The clear action also empties the search box.
      expect(source, dialog).toContain('setSearchInput("")');
      expect(source, dialog).toContain("Clear");
    }
  });

  it("explains an empty result caused by filters rather than by a clear queue", () => {
    const attribute = read(queueDialogs[1]!);

    expect(attribute).toContain("No findings match these filters");
    expect(attribute).toContain("Adjust or clear the search");
  });
});

// ---------------------------------------------------------------------------
// Single scroll region
// ---------------------------------------------------------------------------

describe("Intelligence queue scroll ownership", () => {
  const webRoot = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "..",
  );
  const read = (relativePath: string) =>
    fs.readFileSync(path.join(webRoot, relativePath), "utf8");

  const queueDialogs = [
    "components/components/component-review-queue-dialog.tsx",
    "components/attributes/attribute-review-queue-dialog.tsx",
  ];

  it("stops the dialog body from scrolling in both queues", () => {
    for (const dialog of queueDialogs) {
      const source = read(dialog);

      expect(source, dialog).toContain("<DialogShellBody scrollable={false}>");
      // A leftover `space-y-*` on the body would fight the flex gap.
      expect(source, dialog).not.toContain("<DialogShellBody className=");
    }
  });

  it("lets the item list own the scroll instead of a fixed max height", () => {
    for (const dialog of queueDialogs) {
      const source = read(dialog);

      // The old cap was what created the nested scrollbar.
      expect(source, dialog).not.toContain("max-h-[");
      expect(source, dialog).toContain("min-h-0 flex-1");
      expect(source, dialog).toContain("overflow-y-auto");
    }
  });

  it("pins the tabs and filters so only the list moves", () => {
    for (const dialog of queueDialogs) {
      const source = read(dialog);

      expect(source, dialog).toContain("flex shrink-0 items-center gap-1.5");
      expect(source, dialog).toContain(
        "shrink-0 space-y-2 rounded-xl border border-border bg-card p-3",
      );
    }
  });

  it("keeps the body scrollable by default for every other dialog", () => {
    const shell = read("components/ui/dialog-shell.tsx");

    expect(shell).toContain("scrollable = true");
    expect(shell).toContain('"overflow-y-auto"');
    expect(shell).toContain("flex flex-col gap-4 overflow-hidden");
  });
});

// ---------------------------------------------------------------------------
// List parity with the Attribute queue
// ---------------------------------------------------------------------------

describe("Intelligence queue list parity", () => {
  const webRoot = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "..",
  );
  const read = (relativePath: string) =>
    fs.readFileSync(path.join(webRoot, relativePath), "utf8");

  const componentDialog =
    "components/components/component-review-queue-dialog.tsx";
  const attributeDialog =
    "components/attributes/attribute-review-queue-dialog.tsx";

  /** The shared scroll container class, byte-identical in both queues. */
  const LIST_CONTAINER =
    "min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card shadow-2xs";

  it("uses the same list container as the Attribute queue", () => {
    const component = read(componentDialog);
    const attribute = read(attributeDialog);

    expect(component).toContain(LIST_CONTAINER);
    expect(attribute).toContain(LIST_CONTAINER);
  });

  it("uses the same item wrapper spacing as the Attribute queue", () => {
    const itemClasses = (source: string) => {
      const match = source.match(/className="([^"]*hover:bg-muted\/15[^"]*)"/);
      expect(match).not.toBeNull();
      // Class order is not significant; the set of classes is.
      return [...match![1]!.split(/\s+/)]
        .filter((token) => !token.startsWith("hover:"))
        .sort()
        .join(" ");
    };

    expect(itemClasses(read(componentDialog))).toBe(
      itemClasses(read(attributeDialog)),
    );
  });

  it("no longer paginates either queue's list", () => {
    // Pagination was removed from the Component list first, then from the Attribute
    // list: both are now one scroll region over the whole filtered result.
    for (const dialog of [componentDialog, attributeDialog]) {
      const source = read(dialog);

      for (const gone of [
        "pageNumber",
        "setPageNumber",
        "totalPages",
        "ChevronLeft",
        "ChevronRight",
        "Previous",
        "Next",
        "Page ",
      ]) {
        expect(source, `${dialog}: ${gone}`).not.toContain(gone);
      }
    }
  });

  it("fetches the whole filtered list in a single request", () => {
    const component = read(componentDialog);

    // No `page`/`pageSize`: the backend returns every match when no page size is
    // requested, which is what makes one request per filter set complete.
    expect(component).not.toContain("page: 1");
    expect(component).not.toContain("pageSize:");

    // The Attribute queue loads its list the same way.
    const attribute = read(attributeDialog);

    expect(attribute).not.toContain("page: 1");
    expect(attribute).not.toContain("pageSize:");
  });

  it("still filters server-side, so the single request stays relevant", () => {
    const component = read(componentDialog);

    expect(component).toContain("status: filterValueToParam(statusFilter)");
    expect(component).toContain("search: search.trim() || undefined");
  });

  it("re-reads the persisted list after a decision or an apply", () => {
    // Every write in these dialogs is followed by the same scoped re-read, so the
    // affected row and the tab counts come from the database rather than from a
    // local prediction. This is what a reviewer sees as "the row left the list on
    // its own".
    const component = read(componentDialog);
    const componentApply = component.slice(
      component.indexOf("const applyFinding"),
      component.indexOf("return (", component.indexOf("const applyFinding")),
    );
    expect(componentApply).toContain("await loadQueue();");
    expect(componentApply).toContain("onActionComplete");

    const attribute = read(attributeDialog);
    const attributeApply = attribute.slice(
      attribute.indexOf("const confirmApply"),
      attribute.indexOf("const applyConfirmation"),
    );
    expect(attributeApply).toContain("await loadQueue();");
    expect(attributeApply).toContain("onActionComplete");

    // The Documentation surface is the third place the same findings are applied:
    // it re-reads the finding, then asks the host to re-read the component AND the
    // stored specification state, whose "needs review" summary is server-derived.
    const documents = read(
      "components/documentation/component-specification-intelligence-dialog.tsx",
    );
    expect(documents).toContain("onApplied();");
  });

  it("renders the list as a plain scroll region with no sibling chrome", () => {
    const component = read(componentDialog);
    const listStart = component.indexOf(LIST_CONTAINER);
    // The list is followed directly by the empty-state branch.
    const after = component.slice(listStart);

    expect(after).toContain(") : (");
    expect(after).not.toContain(
      "shrink-0 flex-col items-center justify-between",
    );
  });
});

// ---------------------------------------------------------------------------
// Finding detail footer
// ---------------------------------------------------------------------------

describe("Component intelligence finding dialog footer", () => {
  const webRoot = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "..",
  );
  const read = (relativePath: string) =>
    fs.readFileSync(path.join(webRoot, relativePath), "utf8");

  const dialog =
    "components/components/component-review-queue-finding-dialog.tsx";

  it("orders the footer with the primary action last", () => {
    const source = read(dialog);

    // DESIGN.md: "Footer actions are right-aligned", "Primary action appears last".
    // `decidableActions` returns lifecycle order (ACCEPTED first), which would put
    // Reject/Dismiss after the primary button.
    expect(source).toContain("footerActions.map((decision) =>");
    expect(source).toContain('decision !== "ACCEPTED"');
    expect(source).toContain('decision === "ACCEPTED"');
    // The lifecycle-order array must no longer drive the footer directly.
    expect(source).not.toContain("actions.map((decision) =>");
  });

  it("leaves the consequence note out of the footer", () => {
    const source = read(dialog);
    const footer = source.slice(source.indexOf("<DialogShellFooter"));

    // The footer is a row of buttons; it keeps no copy column of its own.
    expect(footer).not.toContain("justify-between");
    expect(footer).not.toContain("min-w-0 text-[11px]");
    expect(footer).not.toContain("writes the suggested value");
    expect(footer).not.toContain("Review only: this action requires");
  });

  it("states the consequence in the body instead, from one shared source", () => {
    const source = read(dialog);

    // Rendered in the body, gated on the finding still being decidable — the
    // read-only and terminal cases are already explained there.
    expect(source).toContain("actionConsequenceNote(");
    expect(source.indexOf("actionConsequenceNote(")).toBeLessThan(
      source.indexOf("<DialogShellFooter"),
    );
  });
});

describe("Component intelligence action consequence copy", () => {
  it("names the writing action only where writing happens", () => {
    const applicable = actionConsequenceNote(true);

    expect(applicable).toContain(APPLY_COPY.label);
    expect(applicable).toMatch(/writes the suggested value to the component/i);
  });

  it("says plainly that a review-only accept modifies nothing", () => {
    const reviewOnly = actionConsequenceNote(false);

    expect(reviewOnly).toMatch(/does not modify the component/i);
    // No apply label may leak into the review-only case.
    expect(reviewOnly).not.toContain(APPLY_COPY.label);
  });
});

// ---------------------------------------------------------------------------
// Specifications tab — work split
// ---------------------------------------------------------------------------

describe("attribute queue breakdown", () => {
  const attributeFinding = (
    overrides: Record<string, unknown> = {},
  ): ComponentReviewFindingDto =>
    buildFinding({
      issueType: "ATTRIBUTE_VALUE_SUGGESTION",
      issueCategory: "ATTRIBUTE_VALUE",
      ...overrides,
    } as never);

  /** A finding from another family, to prove the split is attribute-only. */
  const otherFinding = (): ComponentReviewFindingDto =>
    buildFinding({
      issueType: "EXACT_DUPLICATE",
      issueCategory: "DUPLICATE",
    });

  it("splits the tab's work by what a reviewer can do with it", () => {
    const breakdown = buildAttributeQueueBreakdown([
      attributeFinding({ confidenceLevel: "HIGH" }),
      attributeFinding({ confidenceLevel: "HIGH" }),
      attributeFinding({ confidenceLevel: "MEDIUM" }),
      attributeFinding({ metadata: { conflict: true } }),
      attributeFinding({
        issueType: "ATTRIBUTE_VALUE_UNKNOWN",
        confidenceLevel: null,
        metadata: { actionable: false },
      }),
    ]);

    expect(breakdown).toMatchObject({
      total: 5,
      highConfidence: 2,
      needsReview: 1,
      conflicts: 1,
      notDetermined: 1,
    });
    expect(breakdown.summary).toBe(
      "5 attribute suggestions · 2 high confidence · 1 need review · 1 conflicting · 1 value not determined",
    );
  });

  it("does not count a conflict as high confidence", () => {
    const breakdown = buildAttributeQueueBreakdown([
      attributeFinding({
        confidenceLevel: "HIGH",
        metadata: { conflict: true },
      }),
    ]);

    expect(breakdown.highConfidence).toBe(0);
    expect(breakdown.conflicts).toBe(1);
  });

  it("omits the categories that have nothing in them", () => {
    const breakdown = buildAttributeQueueBreakdown([
      attributeFinding({ confidenceLevel: "HIGH" }),
    ]);

    expect(breakdown.summary).toBe("1 attribute suggestion · 1 high confidence");
  });

  it("counts only attribute findings, never the whole queue", () => {
    const breakdown = buildAttributeQueueBreakdown([
      otherFinding(),
      attributeFinding({ confidenceLevel: "HIGH" }),
    ]);

    expect(breakdown.total).toBe(1);
  });

  it("reports nothing to summarise for an empty tab", () => {
    const breakdown = buildAttributeQueueBreakdown([otherFinding()]);

    expect(breakdown).toMatchObject({ total: 0, summary: null });
  });
});
