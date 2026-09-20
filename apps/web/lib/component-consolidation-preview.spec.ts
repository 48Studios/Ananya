import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type {
  ConsolidationConflictDto,
  ConsolidationPreviewDto,
} from "./api/component-review-queue-api";
import {
  CONSOLIDATION_EXECUTION_UNAVAILABLE_COPY,
  CONSOLIDATION_SEVERITY_ORDER,
  buildConsolidationAttributeRows,
  buildConsolidationImpactRows,
  consolidationClassificationLabel,
  consolidationScopeNotice,
  explainConsolidationEligibility,
  groupConsolidationConflicts,
  isConsolidationPreviewUnanalyzable,
  sortConsolidationDependencies,
} from "./component-review-queue";

/**
 * Pass 6A coverage: consolidation preview presentation.
 *
 * The strongest assertions here are the *absence* assertions: no execute action
 * exists anywhere in the feature, and the UI never implies otherwise. There is no
 * DOM testing library in this workspace, so rendering claims are covered by
 * source assertions, matching the existing queue-dialog suites.
 */

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

const panelPath = "components/components/component-consolidation-preview-panel.tsx";
const investigationPath =
  "components/components/component-review-duplicate-investigation.tsx";

function conflict(
  overrides: Partial<ConsolidationConflictDto> = {},
): ConsolidationConflictDto {
  return {
    code: "UNSUPPORTED_RETIREMENT_STATE",
    severity: "BLOCKING",
    title: "Component retirement semantics are not defined",
    description: "There is no supported lifecycle for retiring a component.",
    entityType: "components",
    entityIds: [],
    affectedCount: 1,
    sourceComponentId: "source-1",
    canonicalComponentId: "canonical-1",
    resolutionRequired: true,
    blocksExecution: true,
    resolutionSupported: false,
    ...overrides,
  };
}

function dependency(
  overrides: Partial<ConsolidationPreviewDto["dependencies"][number]> = {},
): ConsolidationPreviewDto["dependencies"][number] {
  return {
    id: "inventory_transactions",
    label: "Inventory ledger transactions",
    entity: "inventory_transactions",
    referenceKind: "FK",
    classification: "MUST_PRESERVE",
    executionSupport: "UNSUPPORTED",
    temporality: "HISTORICAL",
    count: 12,
    openCount: 0,
    historicalCount: 12,
    sampleIds: ["tx-1"],
    supportNote: "The inventory ledger is append-only.",
    canonicalCount: 8,
    sourceCount: 4,
    blocking: true,
    ...overrides,
  };
}

function buildPreview(
  overrides: Partial<ConsolidationPreviewDto> = {},
): ConsolidationPreviewDto {
  return {
    findingId: "finding-1",
    executable: false,
    executionBlockedReasons: [
      {
        code: "ATOMICITY_UNAVAILABLE",
        title: "Cross-subsystem atomic transaction boundary unavailable",
        description: "Repositories each bind their own client.",
      },
    ],
    canonical: {
      id: "canonical-1",
      sku: "CMP-000123",
      name: "10K Ohm 0805 Resistor",
      manufacturerId: "mfg-yageo",
      manufacturerPartNumber: "RC0805FR-103KL",
      categoryId: "cat-resistors",
      unit: "pcs",
      isActive: true,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-02-01T00:00:00.000Z",
    },
    sources: [
      {
        id: "source-1",
        sku: "CMP-000987",
        name: "10KΩ 0805 Resistor",
        manufacturerId: "mfg-yageo",
        manufacturerPartNumber: "RC0805FR-103KL",
        categoryId: "cat-resistors",
        unit: "pcs",
        isActive: true,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-02-01T00:00:00.000Z",
      },
    ],
    canonicalCandidates: [
      {
        componentId: "canonical-1",
        isActive: true,
        hasInventory: false,
        createdAt: "2024-01-01T00:00:00.000Z",
        reason: "active · no inventory · oldest record wins ties",
      },
      {
        componentId: "source-1",
        isActive: true,
        hasInventory: true,
        createdAt: "2025-01-01T00:00:00.000Z",
        reason: "active · holds inventory · oldest record wins ties",
      },
    ],
    eligibility: { eligible: true, reasonCodes: [], explanations: [] },
    conflicts: [conflict()],
    dependencies: [dependency()],
    inventory: {
      canonical: {
        componentId: "canonical-1",
        totalQuantity: 5,
        locations: [
          { locationId: "loc-1", quantity: 5, unitOfMeasure: "pcs" },
        ],
        ledgerTransactionCount: 2,
      },
      source: {
        componentId: "source-1",
        totalQuantity: 25,
        locations: [
          { locationId: "loc-1", quantity: 25, unitOfMeasure: "pcs" },
        ],
        ledgerTransactionCount: 3,
      },
      byLocation: [
        {
          locationId: "loc-1",
          canonicalQuantity: 5,
          sourceQuantity: 25,
          combinedQuantity: 30,
          unitOfMeasure: "pcs",
        },
      ],
      combinedTotalQuantity: 30,
      proposedReconciliation: [
        {
          action: "ISSUE_SOURCE",
          locationId: "loc-1",
          quantity: 25,
          unitOfMeasure: "pcs",
        },
        {
          action: "RECEIPT_CANONICAL",
          locationId: "loc-1",
          quantity: 25,
          unitOfMeasure: "pcs",
        },
      ],
      executionSupport: "UNSUPPORTED",
      note: "Balances are read from inventory projections.",
    },
    attributes: {
      entries: [
        {
          attributeDefinitionId: "def-resistance",
          code: "resistance",
          label: "Resistance",
          dataType: "QUANTITY",
          canonicalValue: "10 kohm",
          sourceValue: "10 kohm",
          classification: "IDENTICAL",
          resolutionRequired: false,
          resolutionSupported: true,
        },
        {
          attributeDefinitionId: "def-package",
          code: "package",
          label: "Package",
          dataType: "SELECT",
          canonicalValue: "0805",
          sourceValue: "0603",
          classification: "CONFLICTING",
          resolutionRequired: true,
          resolutionSupported: true,
        },
        {
          attributeDefinitionId: "def-voltage_rating",
          code: "voltage_rating",
          label: "Voltage Rating",
          dataType: "QUANTITY",
          canonicalValue: null,
          sourceValue: "25 V",
          classification: "SOURCE_ONLY",
          resolutionRequired: true,
          resolutionSupported: true,
        },
      ],
      identicalCount: 1,
      canonicalOnlyCount: 0,
      sourceOnlyCount: 1,
      conflictingCount: 1,
    },
    category: {
      canonicalCategoryId: "cat-resistors",
      canonicalCategoryName: "Resistors",
      sourceCategoryId: "cat-resistors",
      sourceCategoryName: "Resistors",
      relation: "SAME",
      note: "Both records share the same category.",
    },
    manufacturer: {
      canonicalManufacturerId: "mfg-yageo",
      canonicalManufacturerName: "Yageo",
      sourceManufacturerId: "mfg-yageo",
      sourceManufacturerName: "Yageo",
      relation: "SAME",
      aliasResolved: false,
      note: "Both records resolve to the same manufacturer identity.",
    },
    bom: {
      canonicalLines: [],
      sourceLines: [],
      collisions: [],
      collisionCount: 0,
      canonicalOnlyCount: 0,
      sourceOnlyCount: 0,
      executionSupport: "UNSUPPORTED",
      note: "BOM line semantics during consolidation are unresolved.",
    },
    procurement: {
      historicalCount: 0,
      openCount: 0,
      repointCount: 0,
      reconcileCount: 0,
      unknownCount: 0,
      count: 0,
    },
    reservations: {
      historicalCount: 0,
      openCount: 0,
      repointCount: 0,
      reconcileCount: 0,
      unknownCount: 0,
      count: 0,
    },
    batches: {
      historicalCount: 0,
      openCount: 0,
      repointCount: 0,
      reconcileCount: 0,
      unknownCount: 0,
      count: 0,
    },
    serials: {
      historicalCount: 0,
      openCount: 0,
      repointCount: 0,
      reconcileCount: 0,
      unknownCount: 0,
      count: 0,
    },
    historicalReferences: {
      historicalCount: 12,
      openCount: 0,
      repointCount: 0,
      reconcileCount: 0,
      unknownCount: 0,
      count: 12,
    },
    polymorphicReferences: [
      {
        id: "documents",
        label: "Documents and attachments",
        entity: "documents",
        canonicalCount: 1,
        sourceCount: 2,
        sampleIds: ["doc-1"],
        supported: true,
        semantics: "CURRENT_REPOINT",
        note: "Documents reference components by entity_type/entity_id with no foreign key.",
      },
    ],
    retirement: {
      canonicalIsActive: true,
      sourceIsActive: true,
      supportedMechanism: "The component lifecycle currently supports only an isActive flag and a hard delete.",
      missingSemantics: [
        "No consolidation target on the component (which record absorbed it)",
        "No rule for retiring a component that still holds stock",
      ],
      executionSupport: "UNSUPPORTED",
      note: "This pass does not introduce a retirement lifecycle, and never sets isActive.",
    },
    history: {
      findingId: "finding-1",
      findingIssueType: "EXACT_DUPLICATE",
      findingMatchType: "EXACT_MPN",
      findingStatus: "PENDING",
      findingFingerprint: "fingerprint-1",
      relatedFindings: [],
      relatedFindingCount: 0,
      feedbackCount: 2,
      intelligenceVersion: "component-review-v3",
    },
    proposedChanges: [
      {
        entity: "components",
        action: "RETIRE",
        recordCount: 1,
        executionSupport: "UNSUPPORTED",
        note: "The retired record would need a lifecycle the domain does not currently define.",
      },
    ],
    dependencyCoverage: {
      ok: true,
      databaseReferenceCount: 34,
      registeredReferenceCount: 34,
      unregisteredReferences: [],
    },
    previewFingerprint: "a".repeat(64),
    previewVersion: "consolidation-preview-v1",
    intelligenceVersion: "component-review-v3",
    computedAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("Pass 6A — consolidation preview contract", () => {
  it('always reports executable as false', () => {
    const preview = buildPreview();
    expect(preview.executable).toBe(false);
  });

  it("states that execution is unavailable and what the feature does not do", () => {
    expect(CONSOLIDATION_EXECUTION_UNAVAILABLE_COPY).toContain(
      "currently unavailable",
    );
    const notice = consolidationScopeNotice();
    for (const verb of [
      "consolidate",
      "merge",
      "delete",
      "retire",
      "repoint",
      "mutate",
    ]) {
      expect(notice).toContain(verb);
    }
  });

  it("groups conflicts by severity with blocking first", () => {
    const preview = buildPreview({
      conflicts: [
        conflict({ code: "HISTORICAL_REFERENCE", severity: "INFORMATIONAL" }),
        conflict({ code: "INVENTORY_PRESENT", severity: "WARNING" }),
        conflict({ code: "ATOMICITY_UNAVAILABLE", severity: "BLOCKING" }),
      ],
    });

    const groups = groupConsolidationConflicts(preview);
    expect(groups.map((group) => group.severity)).toEqual([
      "BLOCKING",
      "WARNING",
      "INFORMATIONAL",
    ]);
    expect(groups[0]!.conflicts[0]!.code).toBe("ATOMICITY_UNAVAILABLE");
    expect(CONSOLIDATION_SEVERITY_ORDER[0]).toBe("BLOCKING");
  });

  it("never groups an empty severity section", () => {
    const groups = groupConsolidationConflicts(
      buildPreview({
        conflicts: [conflict({ severity: "BLOCKING" })],
      }),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.severity).toBe("BLOCKING");
  });

  it("propagates blocksExecution and resolution state to the UI", () => {
    const [group] = groupConsolidationConflicts(
      buildPreview({
        conflicts: [
          conflict({
            code: "ATTRIBUTE_VALUE_DIFFERENCE",
            severity: "WARNING",
            resolutionRequired: true,
            resolutionSupported: false,
            blocksExecution: true,
          }),
        ],
      }),
    );

    const item = group!.conflicts[0]!;
    // Severity is carried by the group, so it is never repeated per item.
    expect(group!.severity).toBe("WARNING");
    expect(group!.label).toBe("Warning");
    expect(item.resolutionRequired).toBe(true);
    expect(item.resolutionSupported).toBe(false);
    // A warning that needs an unimplemented decision still blocks.
    expect(item.blocksExecution).toBe(true);
  });

  it("explains eligibility without inventing reasons", () => {
    expect(explainConsolidationEligibility(buildPreview())).toContain(
      "eligible for consolidation analysis",
    );

    const ineligible = buildPreview({
      eligibility: {
        eligible: false,
        reasonCodes: ["MATCH_TYPE_NOT_CONSOLIDATABLE"],
        explanations: ["Match rule is not eligible for consolidation."],
      },
    });
    expect(explainConsolidationEligibility(ineligible)).toContain(
      "not eligible",
    );
  });

  it("detects an unanalyzable preview", () => {
    expect(isConsolidationPreviewUnanalyzable(buildPreview())).toBe(false);
    expect(
      isConsolidationPreviewUnanalyzable(buildPreview({ dependencies: [] })),
    ).toBe(true);
  });
});

describe("Pass 6A — consolidation impact presentation", () => {
  it("builds the impact summary only from backend numbers", () => {
    const rows = buildConsolidationImpactRows(buildPreview());
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));

    expect(byLabel.Inventory!.value).toBe("5 → 30");
    expect(byLabel.Inventory!.detail).toContain("source holds 25");
    expect(byLabel["Component references"]!.value).toBe("12");
    expect(byLabel["Historical records"]!.value).toBe("12");
    expect(byLabel.Attributes!.value).toBe("3");
    expect(byLabel.Attributes!.detail).toContain("1 conflicting");
    expect(byLabel.Attributes!.detail).toContain("1 source-only");
    expect(byLabel["Other findings"]!.value).toBe("0");
  });

  it("reports BOM collisions in the impact summary when present", () => {
    const rows = buildConsolidationImpactRows(
      buildPreview({
        bom: {
          canonicalLines: [],
          sourceLines: [],
          collisions: [
            {
              bomId: "bom-1",
              canonicalLineId: "line-1",
              sourceLineId: "line-2",
              canonicalQuantityPerUnit: "1.0000",
              sourceQuantityPerUnit: "2.0000",
              canonicalScrapFactorPercent: "0.0000",
              sourceScrapFactorPercent: "0.0000",
              combinedQuantityPerUnit: "3.0000",
              scrapFactorDecisionRequired: false,
            },
          ],
          collisionCount: 1,
          canonicalOnlyCount: 0,
          sourceOnlyCount: 0,
          executionSupport: "UNSUPPORTED",
          note: "unresolved",
        },
      }),
    );
    const bom = rows.find((row) => row.label === "BOM lines")!;
    expect(bom.detail).toContain("1 collision(s) block execution");
  });

  it("ranks blocking dependencies first, then by affected row count", () => {
    const sorted = sortConsolidationDependencies(
      buildPreview({
        dependencies: [
          dependency({ id: "a_preserved", blocking: false, count: 100 }),
          dependency({ id: "b_blocking", blocking: true, count: 1 }),
          dependency({ id: "c_preserved_high", blocking: false, count: 500 }),
        ],
      }),
    );

    expect(sorted.map((entry) => entry.id)).toEqual([
      "b_blocking",
      "c_preserved_high",
      "a_preserved",
    ]);
  });

  it("labels dependencies and attributes in reviewer language", () => {
    expect(consolidationClassificationLabel("MUST_PRESERVE")).toBe("Preserve");
    expect(consolidationClassificationLabel("MUST_REPOINT")).toBe("Repoint");
    expect(consolidationClassificationLabel("UNKNOWN")).toBe("Undefined");
    expect(consolidationClassificationLabel("something_new")).toBe(
      "something_new",
    );
  });

  it("shows attribute conflicts before matching values", () => {
    const rows = buildConsolidationAttributeRows(buildPreview());
    expect(rows[0]!.code).toBe("package");
    expect(rows[0]!.classification).toBe("CONFLICTING");
    expect(rows[1]!.code).toBe("voltage_rating");
    expect(rows[2]!.code).toBe("resistance");
  });
});

describe("Pass 6B — execution exists but is strictly gated", () => {
  const componentSources = [
    panelPath,
    investigationPath,
    "components/components/component-review-queue-finding-dialog.tsx",
  ];

  it("offers no delete or merge action anywhere in the feature", () => {
    // Consolidation RETIRES a component; it never deletes or merges records.
    // The distinction matters: a deleted component would break historical
    // foreign keys, and a merged component would erase its own identity.
    for (const source of componentSources) {
      const contents = read(source);
      const code = contents
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");

      expect(code).not.toContain("Merge components");
      expect(code).not.toContain("Delete components");
      expect(code).not.toContain("removeComponent");
      expect(code).not.toContain("deleteComponent");
    }

    const client = read("lib/api/component-review-queue-api.ts");
    expect(client).not.toMatch(/delete[A-Za-z]*Consolidat/);
    expect(client).not.toMatch(/deactivate[A-Za-z]*Component/);
  });

  it("exposes exactly one execution method, and it posts to /consolidate", () => {
    const client = read("lib/api/component-review-queue-api.ts");
    expect(client).toContain("buildConsolidationPreview");
    expect(client).toContain("consolidateComponent");
    expect(client).toContain("/consolidate");
    // The API client must never offer a way to bypass the preview: the only
    // write path takes the approved fingerprint with it.
    expect(client).toContain("expectedPreviewFingerprint");
    expect(client).toContain("confirmation");
  });

  it("requires explicit confirmation before the execute action is enabled", () => {
    const flow = read(
      "components/components/component-consolidation-execution-flow.tsx",
    );
    // Two stages: the execute button only appears in the confirming stage, and
    // it is disabled until the acknowledgement checkbox is ticked.
    expect(flow).toContain('stage === "idle"');
    expect(flow).toContain('setStage("confirming")');
    expect(flow).toContain("disabled={!acknowledged || submitting}");
    expect(flow).toContain("confirmation: true");
    expect(flow).toContain("I understand");
  });

  it("only renders the execution flow when the backend reports executable", () => {
    const panel = read(panelPath);
    expect(panel).toContain("preview.executable && (");
    expect(panel).toContain("ConsolidationExecutionFlow");
    // The blocked headline is still rendered when the operation is blocked.
    expect(panel).toContain("CONSOLIDATION_EXECUTION_UNAVAILABLE_COPY");
    expect(panel).toContain("consolidationScopeNotice()");
  });

  it("refreshes the preview after a refusal instead of leaving stale facts", () => {
    const flow = read(
      "components/components/component-consolidation-execution-flow.tsx",
    );
    expect(flow).toContain("await onRefresh(canonicalId)");
    expect(flow).toContain("Nothing was changed");
  });

  it("ignores a confirmation that is open when the preview changes", () => {
    const flow = read(
      "components/components/component-consolidation-execution-flow.tsx",
    );
    // A confirmation made against one preview must not carry over to another.
    expect(flow).toContain("[preview.previewFingerprint]");
    expect(flow).toContain('setStage("idle")');
    expect(flow).toContain("setAcknowledged(false)");
  });

  it("requires a decision for every undecided attribute and BOM collision", () => {
    const flow = read(
      "components/components/component-consolidation-execution-flow.tsx",
    );
    expect(flow).toContain("resolutionRequired");
    expect(flow).toContain("decisionsComplete");
    expect(flow).toContain("KEEP_CANONICAL_VALUE");
    expect(flow).toContain("KEEP_SOURCE_VALUE");
    expect(flow).toContain("DISCARD_SOURCE_VALUE");
    expect(flow).toContain("USE_CANONICAL");
    expect(flow).toContain("USE_SOURCE");
    expect(flow).toContain("EXPLICIT");
  });

  it("reloads the preview when the finding's review state changes", () => {
    // Regression: the finding's lifecycle is part of the preview fingerprint, so
    // recording a review decision invalidates any preview already on screen.
    // Without this the panel kept showing "ready to consolidate" and submitted a
    // fingerprint the backend had to reject.
    const panel = read(panelPath);
    expect(panel).toContain("findingRevision");
    expect(panel).toContain("[enabled, load, findingRevision]");

    const investigation = read(investigationPath);
    expect(investigation).toContain("findingRevision={`${finding.status}:${finding.updatedAt}`}");
  });

  it("shows blocking conflicts prominently and never collapses them", () => {
    const panel = read(panelPath);
    // Conflicts are rendered in a full section, not behind a toggle.
    expect(panel).toContain("Conflicts and warnings");
    expect(panel).toContain("SEVERITY_STYLES");
    expect(panel).toContain("groupConsolidationConflicts(preview)");
  });

  it("keeps the duplicate investigation and locked card design intact", () => {
    const investigation = read(investigationPath);
    // The Pass 5C sections are still present and unchanged in structure.
    expect(investigation).toContain("Recorded inconsistencies");
    expect(investigation).toContain("Why this is only a potential duplicate");
    expect(investigation).toContain("Side-by-side comparison");
    expect(investigation).toContain("Show all");

    const queueDialog = read(
      "components/components/component-review-queue-dialog.tsx",
    );
    // The locked card is untouched: the preview lives only in the detail dialog.
    expect(queueDialog).not.toContain("ConsolidationPreviewPanel");
  });

  it("loads the analysis only for reviewers permitted to call the endpoint", () => {
    const investigation = read(investigationPath);
    const dialog = read(
      "components/components/component-review-queue-finding-dialog.tsx",
    );
    expect(investigation).toContain("canAnalyzeConsolidation");
    expect(investigation).toContain("enabled={canAnalyzeConsolidation}");
    expect(dialog).toContain("canAnalyzeConsolidation={permissions.canApply}");
  });

  it("describes the proposed reconciliation as described-only", () => {
    const panel = read(panelPath);
    expect(panel).toContain("Proposed future reconciliation");
    expect(panel).toContain("Described only. Nothing is posted");
  });

  it("surfaces registry drift rather than hiding it", () => {
    const panel = read(panelPath);
    expect(panel).toContain("Coverage verified");
    expect(panel).toContain("Registry drift detected");
  });
});
