import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type {
  ComponentDocumentationStateDto,
  ComponentDocumentationSummaryDto,
  DocumentEvidenceDto,
  SpecificationAggregateDto,
  SpecificationSourceDto,
  UnmappedSpecificationDto,
} from "./api/documentation-intelligence-api";
import {
  SPECIFICATION_FILTERS,
  ambiguityHeading,
  applyApplicationToSpecifications,
  applyDecisionToSpecifications,
  buildSpecificationFilterCounts,
  canApplySpecification,
  canDecideSpecification,
  confidenceLevel,
  confidenceLevelLabel,
  confidencePercent,
  confidenceReasons,
  conflictGroups,
  describeAmbiguity,
  describeConflict,
  describeCorroboration,
  describeErpComparison,
  describeRunOutcome,
  describeSpecificationEvidence,
  documentedValueText,
  emptySpecificationMessage,
  evidenceRoleLabel,
  filterSpecifications,
  hasPrimaryEvidence,
  hasSpecificationIntelligence,
  intelligenceEntryLabel,
  isAmbiguous,
  matchesSpecificationConfidenceFilter,
  matchesSpecificationFilter,
  matchesSpecificationReviewFilters,
  matchesSpecificationStatusFilter,
  sectionLabel,
  sourceErpLabel,
  specificationBadge,
  specificationChipTone,
  specificationEvidenceExcerpt,
  specificationStateLabel,
  specificationUnavailableReason,
  withUpdatedSpecifications,
} from "./specification-intelligence";

/**
 * Pass 4 frontend coverage for Specification Intelligence.
 *
 * Pure logic is exercised directly; rendering claims are source assertions over
 * the real component, because this workspace has no DOM testing library.
 */
const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (absolutePath: string) => fs.readFileSync(absolutePath, "utf8");
const dialogPath = path.join(
  webRoot,
  "components/documentation/component-specification-intelligence-dialog.tsx",
);
const componentPagePath = path.join(webRoot, "app/components/[id]/page.tsx");

function source(
  overrides: Partial<SpecificationSourceDto> = {},
): SpecificationSourceDto {
  return {
    documentId: "doc-1",
    documentVersion: 1,
    documentContentHash: "hash-1",
    documentFileName: "datasheet.pdf",
    documentType: "DATASHEET",
    display: "300Ω",
    normalized: "300",
    agreement: "AGREES",
    erp: "ABSENT",
    detail: null,
    ...overrides,
  };
}

function specification(
  overrides: Partial<SpecificationAggregateDto> = {},
): SpecificationAggregateDto {
  return {
    attributeDefinitionId: "def-resistance",
    attributeCode: "resistance",
    attributeName: "Resistance",
    dataType: "QUANTITY",
    extractedCode: "resistance",
    unitCategory: "Resistance",
    defaultUnit: "ohm",
    state: "AGREED",
    value: { value: 300, unit: "ohm" },
    optionCode: null,
    display: "300Ω",
    sources: [source()],
    groups: [
      { display: "300Ω", normalized: "300", agreement: "AGREES", sources: [source()] },
    ],
    evidence: [
      {
        type: "datasheet_param",
        description: "Extracted resistance rating 300Ω",
        weight: 0.95,
        extractionMethod: "extractor:ee_regex",
        documentId: "doc-1",
        documentVersion: 1,
        documentFileName: "datasheet.pdf",
        documentContentHash: "hash-1",
        page: 3,
        text: "... resistance 300 ohm ...",
        role: "PRIMARY",
        section: "ELECTRICAL_CHARACTERISTICS",
      },
    ],
    documentCount: 1,
    agreeingDocumentCount: 1,
    currentValue: null,
    erpComparison: null,
    erpAgreement: "ABSENT",
    confidence: 0.96,
    confidenceReasons: [
      "+ the attribute mapping is exact",
      "+ the value fits the attribute",
    ],
    notApplicableReason: null,
    review: {
      findingId: "finding-1",
      status: "PENDING",
      fingerprint: "fp-1",
      isNew: true,
      applied: false,
    },
    ...overrides,
  };
}

function summary(
  overrides: Partial<ComponentDocumentationSummaryDto> = {},
): ComponentDocumentationSummaryDto {
  return {
    componentId: "comp-1",
    documentsAnalyzed: 3,
    documentsNotAnalyzed: [],
    documentsSkipped: [],
    specificationsFound: 18,
    needsReview: 3,
    applied: 11,
    conflicts: 2,
    ambiguous: 2,
    unresolved: 1,
    notActionable: 0,
    alreadyCurrent: 4,
    analyzedAt: "2026-09-21T10:00:00.000Z",
    analyzedByEmail: "reviewer@example.com",
    durationMs: 900,
    ...overrides,
  };
}

function unmapped(
  overrides: Partial<UnmappedSpecificationDto> = {},
): UnmappedSpecificationDto {
  return {
    extractedCode: "power",
    formatted: "0.25W",
    resolutionState: "AMBIGUOUS",
    inapplicableReason: "AMBIGUOUS_ATTRIBUTE",
    candidates: [
      {
        attributeDefinitionId: "def-power",
        attributeCode: "power_rating",
        attributeName: "Rated Power",
        score: 0.92,
        reasons: ["the Data Pack expects this attribute for this part type"],
      },
      {
        attributeDefinitionId: "def-peak",
        attributeCode: "peak_power",
        attributeName: "Peak Power",
        score: 0.82,
        reasons: ["the datasheet wording is a qualified form of this attribute"],
      },
    ],
    documentIds: ["doc-1"],
    ...overrides,
  };
}

function state(
  overrides: Partial<ComponentDocumentationSummaryDto> = {},
  stateOverrides: Partial<ComponentDocumentationStateDto> = {},
): ComponentDocumentationStateDto {
  return {
    componentId: "comp-1",
    summary: summary(overrides),
    specifications: [specification()],
    unmapped: [],
    eligibleDocumentIds: ["doc-1"],
    ...stateOverrides,
  };
}

function evidence(
  overrides: Partial<DocumentEvidenceDto> = {},
): DocumentEvidenceDto {
  return {
    type: "datasheet_param",
    description: "Extracted resistance rating 300Ω",
    weight: 0.95,
    extractionMethod: "extractor:ee_regex",
    documentId: "doc-1",
    documentVersion: 1,
    documentFileName: "datasheet.pdf",
    documentContentHash: "hash-1",
    page: 3,
    text: "... resistance 300 ohm ...",
    role: "PRIMARY",
    section: "ELECTRICAL_CHARACTERISTICS",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// State and actions
// ---------------------------------------------------------------------------

describe("specification state", () => {
  it("labels every state a reviewer can see", () => {
    expect(specificationStateLabel("AGREED")).toBe("Ready to review");
    expect(specificationStateLabel("CONFLICT")).toBe("Documents disagree");
    expect(specificationStateLabel("ALREADY_CURRENT")).toBe("Already recorded");
    expect(specificationStateLabel("NOT_ACTIONABLE")).toBe("Not actionable");
  });

  it("shows the applied state ahead of the underlying one", () => {
    expect(
      specificationBadge(
        specification({
          state: "ALREADY_CURRENT",
          review: {
            findingId: "f",
            status: "ACCEPTED",
            fingerprint: "fp",
            isNew: false,
            applied: true,
          },
        }),
      ),
    ).toBe("Applied");
  });

  it("offers Apply only for an agreed, pending, unapplied value", () => {
    expect(canApplySpecification(specification(), true)).toBe(true);
    expect(canApplySpecification(specification(), false)).toBe(false);
    expect(
      canApplySpecification(specification({ state: "CONFLICT" }), true),
    ).toBe(false);
    expect(
      canApplySpecification(specification({ state: "ALREADY_CURRENT" }), true),
    ).toBe(false);
    expect(
      canApplySpecification(specification({ state: "NOT_ACTIONABLE" }), true),
    ).toBe(false);
  });

  it("never offers Apply for a closed or applied suggestion", () => {
    for (const status of ["REJECTED", "DISMISSED", "ACCEPTED"] as const) {
      expect(
        canApplySpecification(
          specification({
            review: {
              findingId: "f",
              status,
              fingerprint: "fp",
              isNew: false,
              applied: false,
            },
          }),
          true,
        ),
      ).toBe(false);
    }
  });

  it("still offers a decision for a stale suggestion", () => {
    const stale = specification({
      review: {
        findingId: "f",
        status: "STALE",
        fingerprint: "fp",
        isNew: false,
        applied: false,
      },
    });
    expect(canDecideSpecification(stale, true)).toBe(true);
    expect(canApplySpecification(stale, true)).toBe(false);
  });

  it("says a conflict is for a human to adjudicate", () => {
    const reason = specificationUnavailableReason(
      specification({ state: "CONFLICT" }),
      true,
    );
    expect(reason).toContain("documents disagree");
    expect(reason).toContain("no source is applied automatically");
  });

  it("explains every other withheld action", () => {
    expect(
      specificationUnavailableReason(
        specification({ state: "ALREADY_CURRENT" }),
        true,
      ),
    ).toContain("already records");

    expect(
      specificationUnavailableReason(
        specification({
          state: "NOT_ACTIONABLE",
          notApplicableReason: "INVALID_VALUE",
        }),
        true,
      ),
    ).toBe("INVALID_VALUE");

    expect(
      specificationUnavailableReason(specification(), false),
    ).toContain("Inventory.Update");

    expect(
      specificationUnavailableReason(
        specification({
          review: {
            findingId: "f",
            status: "ACCEPTED",
            fingerprint: "fp",
            isNew: false,
            applied: true,
          },
        }),
        true,
      ),
    ).toContain("already applied");

    expect(specificationUnavailableReason(specification(), true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

describe("evidence presentation", () => {
  it("names the section, version and page", () => {
    expect(
      describeSpecificationEvidence({
        fileName: "datasheet.pdf",
        documentType: "DATASHEET",
        version: 2,
        page: 3,
        section: "ELECTRICAL_CHARACTERISTICS",
      }),
    ).toBe("datasheet.pdf · v2 · Electrical characteristics · page 3");
  });

  it("says a page is unknown rather than inventing one", () => {
    expect(
      describeSpecificationEvidence({
        fileName: "datasheet.pdf",
        documentType: "DATASHEET",
        version: 1,
        page: null,
        section: null,
      }),
    ).toBe("datasheet.pdf · page unknown");
  });

  it("falls back to the document type when there is no file name", () => {
    expect(
      describeSpecificationEvidence({
        fileName: null,
        documentType: "PRODUCT_PAGE",
        version: 1,
        page: 2,
        section: null,
      }),
    ).toBe("PRODUCT_PAGE · page 2");
  });

  it("labels every evidence role and section", () => {
    expect(evidenceRoleLabel("PRIMARY")).toBe("Specification table");
    expect(evidenceRoleLabel("SUPPORTING")).toBe("Supporting section");
    expect(evidenceRoleLabel("CONTEXTUAL")).toBe("Contextual mention");
    expect(sectionLabel("ABSOLUTE_MAXIMUM_RATINGS")).toBe(
      "Absolute maximum ratings",
    );
    expect(sectionLabel(null)).toBeNull();
  });

  it("detects primary evidence", () => {
    expect(hasPrimaryEvidence(specification())).toBe(true);
    expect(
      hasPrimaryEvidence(
        specification({
          evidence: [
            {
              ...specification().evidence[0]!,
              role: "CONTEXTUAL",
              section: "GENERAL",
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("states corroboration only when more than one document agrees", () => {
    expect(describeCorroboration(specification())).toBeNull();
    expect(
      describeCorroboration(
        specification({
          agreeingDocumentCount: 2,
          sources: [
            source(),
            source({ documentId: "doc-2", documentFileName: "product-page.pdf" }),
          ],
        }),
      ),
    ).toBe("2 documents agree on this value.");
  });

  it("never counts a conflicting document as corroboration", () => {
    // The server-derived count excludes disagreements, so a conflict cannot be
    // presented as corroborated evidence.
    expect(
      describeCorroboration(
        specification({
          agreeingDocumentCount: 1,
          sources: [
            source(),
            source({
              documentId: "doc-2",
              documentFileName: "product-page.pdf",
              agreement: "CONFLICTS",
            }),
          ],
        }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

describe("conflict presentation", () => {
  const conflict = specification({
    state: "CONFLICT",
    value: null,
    display: null,
    erpAgreement: "CONFLICTS",
    currentValue: "50 V",
    groups: [
      {
        display: "50V",
        normalized: "50",
        agreement: "AGREES",
        sources: [source({ display: "50V", normalized: "50" })],
      },
      {
        display: "25V",
        normalized: "25",
        agreement: "CONFLICTS",
        sources: [
          source({
            documentId: "doc-2",
            documentFileName: "product-page.pdf",
            display: "25V",
            normalized: "25",
            agreement: "CONFLICTS",
          }),
        ],
      },
    ],
  });

  it("lists both sides of a conflict without preferring one", () => {
    expect(describeConflict(conflict)).toEqual([
      "datasheet.pdf state 50V",
      "product-page.pdf state 25V",
    ]);
  });

  it("groups the sources behind each stated value", () => {
    const groups = conflictGroups(conflict);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.fileNames).toEqual(["datasheet.pdf"]);
    expect(groups[1]!.documentIds).toEqual(["doc-2"]);
  });

  it("states the value the component records", () => {
    expect(describeErpComparison(conflict)).toBe(
      "The component records 50 V.",
    );
  });

  it("describes every relationship with the recorded value", () => {
    expect(
      describeErpComparison(specification({ erpAgreement: "ABSENT" })),
    ).toContain("does not record");
    expect(
      describeErpComparison(
        specification({ erpAgreement: "AGREES", currentValue: "300 ohm" }),
      ),
    ).toContain("already records 300 ohm");
    expect(
      describeErpComparison(
        specification({ erpAgreement: "INCOMPARABLE" }),
      ),
    ).toContain("could not be compared");
  });

  it("labels a source's agreement with the recorded value", () => {
    expect(sourceErpLabel(source({ erp: "AGREES" }))).toContain("agrees");
    expect(sourceErpLabel(source({ erp: "CONFLICTS" }))).toContain("differs");
    expect(sourceErpLabel(source({ erp: "ABSENT" }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ambiguity
// ---------------------------------------------------------------------------

describe("ambiguity presentation", () => {
  it("lists the possible attributes with their reasons", () => {
    expect(describeAmbiguity(unmapped())).toEqual([
      {
        name: "Rated Power",
        reasons: ["the Data Pack expects this attribute for this part type"],
      },
      {
        name: "Peak Power",
        reasons: [
          "the datasheet wording is a qualified form of this attribute",
        ],
      },
    ]);
  });

  it("names the extracted wording in the heading", () => {
    expect(ambiguityHeading(unmapped())).toBe(
      "0.25W could belong to more than one attribute",
    );
  });

  it("distinguishes ambiguity from a property nothing matches", () => {
    expect(isAmbiguous(unmapped())).toBe(true);
    expect(
      isAmbiguous(
        unmapped({ resolutionState: "UNRESOLVED", candidates: [] }),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

describe("confidence presentation", () => {
  it("reports a percentage and a word", () => {
    expect(confidencePercent(0.96)).toBe(96);
    expect(confidencePercent(0)).toBe(0);
    expect(confidencePercent(1.4)).toBe(100);
    expect(confidenceLevelLabel(0.96)).toBe("High confidence");
    expect(confidenceLevelLabel(0.7)).toBe("Medium confidence");
    expect(confidenceLevelLabel(0.4)).toBe("Low confidence");
  });

  it("splits reasons by direction without exposing a formula", () => {
    const reasons = confidenceReasons(
      specification({
        confidenceReasons: [
          "+ the attribute mapping is exact",
          "+ two documents agree",
          "- documents disagree about the value",
        ],
      }),
    );

    expect(reasons.positive).toEqual([
      "the attribute mapping is exact",
      "two documents agree",
    ]);
    expect(reasons.negative).toEqual(["documents disagree about the value"]);
  });

  it("keeps an unsignposted reason on the positive side", () => {
    expect(
      confidenceReasons(specification({ confidenceReasons: ["a fact"] }))
        .positive,
    ).toEqual(["a fact"]);
  });
});

// ---------------------------------------------------------------------------
// Card presentation
// ---------------------------------------------------------------------------

describe("review card presentation", () => {
  it("tones the state chip by what the state means for a reviewer", () => {
    // A conflict is the one state that always needs a human.
    expect(specificationChipTone(specification({ state: "CONFLICT" }))).toBe(
      "WARNING",
    );
    // Ready to review is the ordinary case.
    expect(specificationChipTone(specification({ state: "AGREED" }))).toBe(
      "PRIMARY",
    );
    // Informational states are not warnings.
    expect(
      specificationChipTone(specification({ state: "ALREADY_CURRENT" })),
    ).toBe("SUCCESS");
    expect(
      specificationChipTone(specification({ state: "NOT_ACTIONABLE" })),
    ).toBe("NEUTRAL");
  });

  it("reports an applied specification as success whatever its state was", () => {
    // Applying is the outcome the reviewer was working towards, so the chip must
    // not keep reporting the pre-review state afterwards.
    const applied = specification({
      state: "CONFLICT",
      review: {
        findingId: "f",
        status: "ACCEPTED",
        fingerprint: "fp",
        isNew: false,
        applied: true,
      },
    });

    expect(specificationChipTone(applied)).toBe("SUCCESS");
    expect(specificationBadge(applied)).toBe("Applied");
  });

  it("buckets confidence on the same thresholds as the label", () => {
    // The badge and the words must never disagree about the same number.
    expect(confidenceLevel(0.95)).toBe("HIGH");
    expect(confidenceLevel(0.8)).toBe("HIGH");
    expect(confidenceLevel(0.79)).toBe("MEDIUM");
    expect(confidenceLevel(0.6)).toBe("MEDIUM");
    expect(confidenceLevel(0.59)).toBe("LOW");
    expect(confidenceLevel(0)).toBe("LOW");

    for (const value of [0, 0.3, 0.59, 0.6, 0.79, 0.8, 0.95, 1]) {
      expect(confidenceLevelLabel(value).toUpperCase()).toContain(
        confidenceLevel(value),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Empty results
// ---------------------------------------------------------------------------

describe("empty result copy", () => {
  it("explains an empty result instead of showing nothing", () => {
    expect(
      emptySpecificationMessage(
        summary({
          documentsAnalyzed: 0,
          documentsNotAnalyzed: ["doc-1"],
        }),
      ),
    ).toContain("could be analyzed");
    expect(
      emptySpecificationMessage(
        summary({
          documentsAnalyzed: 2,
          documentsSkipped: [
            { reason: "ANALYSIS_FAILED", message: "boom", documentIds: ["d"] },
          ],
        }),
      ),
    ).toContain("1 document(s) could not be analyzed");
    expect(emptySpecificationMessage(summary())).toContain(
      "No specifications were found",
    );
  });

  it("describes what a run changed", () => {
    expect(
      describeRunOutcome({
        documentsAnalyzed: 3,
        createdFindingCount: 2,
        staledFindingCount: 1,
      }),
    ).toBe("3 documents analyzed · 2 new specifications · 1 superseded suggestion retired");

    expect(
      describeRunOutcome({
        documentsAnalyzed: 1,
        createdFindingCount: 0,
        staledFindingCount: 0,
      }),
    ).toBe("1 document analyzed");
  });
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

describe("specification filters", () => {
  it("offers the canonical filter set", () => {
    expect(SPECIFICATION_FILTERS.map((filter) => filter.id)).toEqual([
      "ALL",
      "NEEDS_REVIEW",
      "CONFLICTS",
      "ALREADY_CURRENT",
      "APPLIED",
      "AMBIGUOUS",
    ]);
  });

  it("classifies each specification", () => {
    const agreed = specification();
    const conflict = specification({ state: "CONFLICT" });
    const current = specification({ state: "ALREADY_CURRENT" });
    const applied = specification({
      state: "ALREADY_CURRENT",
      review: {
        findingId: "f",
        status: "ACCEPTED",
        fingerprint: "fp",
        isNew: false,
        applied: true,
      },
    });

    expect(matchesSpecificationFilter(agreed, "NEEDS_REVIEW")).toBe(true);
    expect(matchesSpecificationFilter(conflict, "CONFLICTS")).toBe(true);
    expect(matchesSpecificationFilter(current, "ALREADY_CURRENT")).toBe(true);
    expect(matchesSpecificationFilter(applied, "APPLIED")).toBe(true);
    expect(matchesSpecificationFilter(applied, "NEEDS_REVIEW")).toBe(false);
    expect(matchesSpecificationFilter(agreed, "ALL")).toBe(true);
  });

  it("counts every filter, taking ambiguity from the unmapped list", () => {
    const counts = buildSpecificationFilterCounts(
      [
        specification(),
        specification({ state: "CONFLICT" }),
        specification({ state: "ALREADY_CURRENT" }),
      ],
      [unmapped(), unmapped({ resolutionState: "UNRESOLVED", candidates: [] })],
    );

    expect(counts.ALL).toBe(3);
    // All three fixtures carry a pending finding, and "needs review" is the
    // server's definition of that — the same one the summary strip reports.
    expect(counts.NEEDS_REVIEW).toBe(3);
    expect(counts.CONFLICTS).toBe(1);
    expect(counts.ALREADY_CURRENT).toBe(1);
    expect(counts.APPLIED).toBe(0);
    // Ambiguity is a property of an unmapped property, not of an aggregate.
    expect(counts.AMBIGUOUS).toBe(1);
  });

  it("agrees with the summary's needs-review count", () => {
    // The chip and the summary strip show the same label, so they must not
    // derive the number from different things.
    const rows = [
      specification(),
      specification({ state: "CONFLICT" }),
      specification({
        state: "ALREADY_CURRENT",
        review: null,
      }),
      specification({
        review: {
          findingId: "finding-2",
          status: "ACCEPTED",
          fingerprint: "fp-2",
          isNew: false,
          applied: true,
        },
      }),
    ];

    const pending = rows.filter(
      (row) => row.review?.status === "PENDING" && !row.review.applied,
    ).length;

    expect(buildSpecificationFilterCounts(rows, []).NEEDS_REVIEW).toBe(pending);
    expect(pending).toBe(2);
  });

  it("filters without dropping the source list", () => {
    const all = [specification(), specification({ state: "CONFLICT" })];
    expect(filterSpecifications(all, "CONFLICTS")).toHaveLength(1);
    expect(filterSpecifications(all, "AMBIGUOUS")).toEqual([]);
    expect(all).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Shared review filters (status + confidence)
// ---------------------------------------------------------------------------

describe("specification review filters", () => {
  it("matches a review status, including the combined outstanding-work option", () => {
    const pending = specification();
    const accepted = specification({
      review: {
        findingId: "finding-2",
        status: "ACCEPTED",
        fingerprint: "fp-2",
        isNew: false,
        applied: false,
      },
    });
    const stale = specification({
      review: {
        findingId: "finding-3",
        status: "STALE",
        fingerprint: "fp-3",
        isNew: false,
        applied: false,
      },
    });
    const undecided = specification({ review: null });

    expect(matchesSpecificationStatusFilter(pending, "ALL")).toBe(true);
    expect(matchesSpecificationStatusFilter(pending, "PENDING")).toBe(true);
    expect(matchesSpecificationStatusFilter(accepted, "PENDING")).toBe(false);
    expect(matchesSpecificationStatusFilter(stale, "PENDING,STALE")).toBe(true);
    expect(matchesSpecificationStatusFilter(pending, "PENDING,STALE")).toBe(
      true,
    );
    expect(matchesSpecificationStatusFilter(accepted, "PENDING,STALE")).toBe(
      false,
    );
    // A specification with no review item is not a member of any status filter.
    expect(matchesSpecificationStatusFilter(undecided, "PENDING")).toBe(false);
  });

  it("matches a confidence band through the shared vocabulary", () => {
    const high = specification({ confidence: 0.96 });
    const medium = specification({ confidence: 0.7 });
    const low = specification({ confidence: 0.3 });

    expect(matchesSpecificationConfidenceFilter(high, "HIGH")).toBe(true);
    expect(matchesSpecificationConfidenceFilter(high, "MEDIUM")).toBe(false);
    expect(matchesSpecificationConfidenceFilter(medium, "MEDIUM")).toBe(true);
    expect(matchesSpecificationConfidenceFilter(low, "LOW")).toBe(true);
    expect(matchesSpecificationConfidenceFilter(low, "ALL")).toBe(true);
  });

  it("combines both filters for the list and the tab counts", () => {
    const rows = [
      specification(),
      specification({
        attributeDefinitionId: "def-2",
        state: "CONFLICT",
        confidence: 0.4,
      }),
      specification({
        attributeDefinitionId: "def-3",
        review: {
          findingId: "finding-3",
          status: "ACCEPTED",
          fingerprint: "fp-3",
          isNew: false,
          applied: true,
        },
      }),
    ];

    const filters = { status: "PENDING", confidence: "HIGH" };

    // Only the first row is pending at high confidence.
    expect(
      rows.filter((row) => matchesSpecificationReviewFilters(row, filters)),
    ).toHaveLength(1);

    // The list and the counts are computed from the SAME scoped set, so a tab
    // can never report a number the reviewer cannot reach by clicking it.
    const scoped = rows.filter((row) =>
      matchesSpecificationReviewFilters(row, filters),
    );
    expect(filterSpecifications(scoped, "ALL", filters)).toHaveLength(1);
    expect(buildSpecificationFilterCounts(scoped, []).CONFLICTS).toBe(0);
    expect(buildSpecificationFilterCounts(scoped, []).NEEDS_REVIEW).toBe(1);
  });

  it("leaves an unmapped property visible whatever the filters say", () => {
    // An ambiguous property has no review status and no confidence of its own, so
    // filtering on either must not hide a property that still needs a decision.
    const scoped = [specification()].filter((row) =>
      matchesSpecificationReviewFilters(row, {
        status: "REJECTED",
        confidence: "LOW",
      }),
    );

    expect(scoped).toHaveLength(0);
    expect(filterSpecifications(scoped, "ALL", {
      status: "REJECTED",
      confidence: "LOW",
    })).toHaveLength(0);
    // The unmapped list is passed through untouched by the dialog.
    expect(buildSpecificationFilterCounts(scoped, [unmapped()]).AMBIGUOUS).toBe(
      1,
    );
  });
});

// ---------------------------------------------------------------------------
// Rendering (source assertions)
// ---------------------------------------------------------------------------

describe("specification intelligence dialog", () => {
  const source_ = read(dialogPath);

  it("has no statistics card, so the counts live in the tabs", () => {
    // The summary strip was removed to match the Component Intelligence queue:
    // the same numbers are in the tab labels, next to the filter that acts on
    // them, instead of in a second place that could disagree.
    expect(source_).not.toContain("buildSummaryRows");
    expect(source_).not.toContain("gap-x-5");
    expect(source_).toContain("option.label} ({");
  });

  it("offers the shared status and confidence filters", () => {
    // The two controls the Component and Attribute queues have, from the same
    // vocabulary: this surface used to have no status or confidence filter at
    // all, so "what still needs review" could not be asked here.
    expect(source_).toContain('aria-label="Status filter"');
    expect(source_).toContain('aria-label="Confidence filter"');
    expect(source_).toContain("INTELLIGENCE_STATUS_FILTER_OPTIONS");
    expect(source_).toContain("INTELLIGENCE_CONFIDENCE_FILTER_OPTIONS");
    expect(source_).toContain("All statuses");
    expect(source_).toContain("All confidence");
    // No local option list of its own.
    expect(source_).not.toContain('label: "Needs review"');
  });

  it("scopes the tab counts with the review filters", () => {
    // The counts and the list must be computed from the same scoped set, or a tab
    // could report a number the reviewer cannot reach.
    expect(source_).toContain("matchesSpecificationReviewFilters");
    expect(source_).toContain("buildSpecificationFilterCounts(scopedSpecifications");
    expect(source_).toContain("filterSpecifications(state.specifications, filter, reviewFilters)");
  });

  it("offers a clear action only when something is actually filtered", () => {
    expect(source_).toContain("clearFilters");
    expect(source_).toContain("filtersActive");
    // Clearing resets all three controls, including the tab row.
    const clear = source_.slice(
      source_.indexOf("const clearFilters = () => {"),
      source_.indexOf("};", source_.indexOf("const clearFilters = () => {")),
    );
    expect(clear).toContain('setFilter("ALL")');
    expect(clear).toContain("ALL_FILTER_VALUE");
  });

  it("treats a failed post-apply re-read as a patch, not as a failed apply", () => {
    // The write is committed before the re-read runs, so a failure there must not
    // be reported as an apply failure. The row falls back to the apply result.
    const apply = source_.slice(
      source_.indexOf("const applyValue = async"),
      source_.indexOf("const previewDocument"),
    );
    expect(apply).toContain("applyFinding");
    expect(apply).toContain("getFinding");
    expect(apply).toMatch(/try \{\s*finding = await componentReviewQueueApi\.getFinding/);
    // And the host is told, so the component AND the stored state are re-read.
    expect(apply).toContain("onApplied()");
    expect(read(componentPagePath)).toContain("onApplied={handleApplied}");
    expect(read(componentPagePath)).toContain("void loadIntelligence();");
  });

  it("renders the state the host loaded rather than deriving it again", () => {
    // The modal renders state the host loaded; the host owns the API calls.
    expect(read(componentPagePath)).toContain("componentSpecificationApi");
    expect(source_).toContain("state?.summary");
  });

  it("matches the Component queue's tab treatment", () => {
    // Byte-identical classes to the Component Intelligence queue's tabs, so the
    // two queues cannot drift apart again.
    const componentQueue = read(
      path.join(
        webRoot,
        "components/components/component-review-queue-dialog.tsx",
      ),
    );
    const TAB_ROW = "flex shrink-0 items-center gap-1.5 overflow-x-auto pb-1";
    const TAB_ACTIVE = "bg-primary text-primary-foreground";
    const TAB_IDLE = "bg-muted text-muted-foreground hover:text-foreground";

    for (const tabClass of [TAB_ROW, TAB_ACTIVE, TAB_IDLE]) {
      expect(componentQueue, `component: ${tabClass}`).toContain(tabClass);
      expect(source_, `documentation: ${tabClass}`).toContain(tabClass);
    }
  });

  it("matches the Component queue's review card shape", () => {
    const componentQueue = read(
      path.join(
        webRoot,
        "components/components/component-review-queue-dialog.tsx",
      ),
    );

    // One scroll region, one item wrapper, one subject row: the same strings the
    // Component queue uses.
    const LIST_CONTAINER =
      "min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card shadow-2xs";
    const ITEM = "space-y-2.5 p-4 transition-colors hover:bg-muted/15";
    const CONTEXT_ROW =
      "flex flex-col justify-between gap-2 rounded-lg border border-border/70 bg-muted/40 p-2.5 text-xs sm:flex-row sm:items-center";
    const ACTIONS = "flex shrink-0 items-center gap-1.5 self-end pt-0.5 sm:self-start";

    for (const shared of [LIST_CONTAINER, ITEM, CONTEXT_ROW, ACTIONS]) {
      expect(componentQueue, `component: ${shared}`).toContain(shared);
      expect(source_, `documentation: ${shared}`).toContain(shared);
    }
  });

  it("hides the evidence behind the same help button the queue uses", () => {
    // The card reads as a finding first; the grounding is one click away.
    expect(source_).toContain("expandedWhy");
    expect(source_).toContain("Reasoning Evidence &amp; Grounding:");
    expect(source_).toContain('title="View reasoning evidence"');
    // The body hands the scroll to the list, like the Component queue.
    expect(source_).toContain("<DialogShellBody scrollable={false}>");
  });

  it("badges lifecycle and confidence with the shared vocabulary", () => {
    // The same StatusBadge tones the Component queue uses, so a PENDING finding
    // looks the same in both queues.
    expect(source_).toContain("STATUS_BADGE[review.status]");
    expect(source_).toContain("confidenceBadgeStatus(level)");
    expect(source_).toContain("specificationChipTone");
  });

  it("drives every action from the shared presentation rules", () => {
    expect(source_).toContain("canApplySpecification");
    expect(source_).toContain("canDecideSpecification");
    expect(source_).toContain("specificationUnavailableReason");
    expect(source_).toContain("specificationBadge");
  });

  it("shows conflicts and ambiguities through the shared helpers", () => {
    expect(source_).toContain("describeConflict");
    expect(source_).toContain("describeAmbiguity");
    expect(source_).toContain("ambiguityHeading");
  });

  it("shows confidence as reasons rather than a score", () => {
    expect(source_).toContain("confidenceReasons");
    expect(source_).toContain("confidencePercent");
  });

  it("routes every review action through the existing queue endpoints", () => {
    expect(source_).toContain("componentReviewQueueApi.recordDecision");
    expect(source_).toContain("componentReviewQueueApi.applyFinding");
    expect(source_).toContain("componentReviewQueueApi.getFinding");
  });

  it("accepts and applies in one step, like the review queue does", () => {
    // Accepting on its own would leave an applicable finding with no next
    // action: ACCEPTED is neither decidable nor appliable under the shared
    // rules, so the primary action must do both.
    expect(source_).toContain("Accept &amp; Apply");
    expect(source_).toContain("canApply ?");
  });

  it("is a dialog built on the shared shell, not a second dialog", () => {
    expect(source_).toContain("DialogShell");
    expect(source_).toContain("DialogShellBody");
    expect(source_).toContain("DialogShellFooter");
    // The wide workbench the redesign asks for, with the shell's own height cap
    // and internal scrolling rather than a page that scrolls behind the modal.
    expect(source_).toContain('size="lg"');
  });

  it("shows evidence with its role, page, section and excerpt", () => {
    expect(source_).toContain("describeSpecificationEvidence");
    expect(source_).toContain("evidenceRoleLabel");
    expect(source_).toContain("specificationEvidenceExcerpt");
  });

  it("reuses the existing document preview instead of inventing one", () => {
    expect(source_).toContain("DocumentViewer");
    expect(source_).toContain("documentsApi.getDocument");
  });

  it("never runs the analysis just because it opened", () => {
    expect(source_).not.toContain("componentSpecificationApi.analyze");
  });
});

describe("specification intelligence entry point", () => {
  const page = read(componentPagePath);

  it("replaces the permanent inline panel", () => {
    expect(fs.existsSync(
      path.join(
        webRoot,
        "components/documentation/component-specification-intelligence-panel.tsx",
      ),
    )).toBe(false);
    expect(page).not.toContain("ComponentSpecificationIntelligencePanel");
    expect(page).toContain("ComponentSpecificationIntelligenceDialog");
  });

  it("loads stored state once and only analyzes when nothing was analyzed", () => {
    expect(page).toContain("componentSpecificationApi.getState");
    expect(page).toContain("componentSpecificationApi.analyze");
    expect(page).toContain("documentsAnalyzed === 0");
  });

  it("renders the entry point inside the documentation section header", () => {
    expect(page).toContain("headerActions");
    expect(page).toContain("intelligenceEntryLabel");
    expect(page).toContain("hasSpecificationIntelligence");
  });
});

// ---------------------------------------------------------------------------
// Entry point copy
// ---------------------------------------------------------------------------

describe("intelligenceEntryLabel", () => {
  it("offers to analyze when nothing has been analyzed", () => {
    expect(intelligenceEntryLabel(state({ documentsAnalyzed: 0 }))).toBe(
      "Analyze documents",
    );
  });

  it("names the pending review count once an analysis exists", () => {
    expect(intelligenceEntryLabel(state({ needsReview: 3 }))).toBe(
      "Documentation Intelligence · 3 reviews",
    );
  });

  it("uses the singular for one pending review", () => {
    expect(intelligenceEntryLabel(state({ needsReview: 1 }))).toBe(
      "Documentation Intelligence · 1 review",
    );
  });

  it("drops the count when nothing is pending", () => {
    expect(intelligenceEntryLabel(state({ needsReview: 0 }))).toBe(
      "Documentation Intelligence",
    );
  });

  it("falls back to the plain name before state has loaded", () => {
    expect(intelligenceEntryLabel(null)).toBe("Documentation Intelligence");
  });
});

describe("hasSpecificationIntelligence", () => {
  it("withholds the entry point when there is nothing to read", () => {
    expect(hasSpecificationIntelligence(null)).toBe(false);
    expect(
      hasSpecificationIntelligence(
        state({ documentsAnalyzed: 0 }, { eligibleDocumentIds: [] }),
      ),
    ).toBe(false);
  });

  it("offers it once documents are eligible", () => {
    expect(
      hasSpecificationIntelligence(
        state({ documentsAnalyzed: 0 }, { eligibleDocumentIds: ["doc-1"] }),
      ),
    ).toBe(true);
  });

  it("keeps a stored analysis reachable after its documents are gone", () => {
    expect(
      hasSpecificationIntelligence(
        state({ documentsAnalyzed: 2 }, { eligibleDocumentIds: [] }),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Targeted state updates
// ---------------------------------------------------------------------------

function finding(overrides: Record<string, unknown> = {}) {
  return {
    id: "finding-1",
    fingerprint: "fp-1",
    status: "ACCEPTED" as const,
    ...overrides,
  } as unknown as Parameters<typeof applyDecisionToSpecifications>[1];
}

function applyResult(overrides: Record<string, unknown> = {}) {
  return {
    fieldLabel: "Resistance",
    appliedValue: "300",
    appliedValueLabel: "300Ω",
    ...overrides,
  } as unknown as Parameters<typeof applyApplicationToSpecifications>[2];
}

describe("applyDecisionToSpecifications", () => {
  it("rewrites only the row the finding belongs to", () => {
    const rows = [
      specification(),
      specification({
        attributeDefinitionId: "def-power",
        attributeName: "Power Rating",
        review: {
          findingId: "finding-2",
          status: "PENDING",
          fingerprint: "fp-2",
          isNew: true,
          applied: false,
        },
      }),
    ];

    const next = applyDecisionToSpecifications(
      rows,
      finding({ status: "REJECTED" }),
    );

    expect(next[0]?.review?.status).toBe("REJECTED");
    expect(next[0]?.review?.isNew).toBe(false);
    expect(next[1]?.review?.status).toBe("PENDING");
  });

  it("leaves the aggregate state alone: accepting does not change the documents", () => {
    const next = applyDecisionToSpecifications([specification()], finding());
    expect(next[0]?.state).toBe("AGREED");
    expect(next[0]?.currentValue).toBeNull();
  });
});

describe("applyApplicationToSpecifications", () => {
  it("moves the recorded value and stops offering an apply", () => {
    const next = applyApplicationToSpecifications(
      [specification()],
      finding(),
      applyResult(),
    );
    const row = next[0]!;

    expect(row.state).toBe("ALREADY_CURRENT");
    expect(row.currentValue).toBe("300Ω");
    expect(row.erpAgreement).toBe("AGREES");
    expect(row.review?.applied).toBe(true);
    // The shared rules now refuse to apply it again, and say why.
    expect(canApplySpecification(row, true)).toBe(false);
    expect(specificationUnavailableReason(row, true)).toContain(
      "already applied",
    );
  });

  it("falls back to the applied value when no label is returned", () => {
    const next = applyApplicationToSpecifications(
      [specification()],
      finding(),
      applyResult({ appliedValueLabel: null }),
    );
    expect(next[0]?.currentValue).toBe("300");
  });
});

describe("withUpdatedSpecifications", () => {
  it("keeps the summary that the server derived", () => {
    const current = state();
    const next = withUpdatedSpecifications(current, []);
    expect(next.summary).toBe(current.summary);
    expect(next.specifications).toEqual([]);
  });
});

describe("documentedValueText", () => {
  it("prefers the appliable display when there is one", () => {
    expect(documentedValueText(specification())).toBe("300Ω");
  });

  it("reads the stated values when nothing is appliable", () => {
    // An already-recorded value has no `display`, so without the fallback the
    // row would read "Documented: —" beside a current value the reviewer sees.
    expect(
      documentedValueText(
        specification({
          state: "ALREADY_CURRENT",
          display: null,
          sources: [source({ display: "330 ohm", agreement: "AGREES" })],
          groups: [
            {
              display: "330 ohm",
              normalized: "330",
              agreement: "AGREES",
              sources: [source({ display: "330 ohm", agreement: "AGREES" })],
            },
          ],
        }),
      ),
    ).toBe("330 ohm");
  });

  it("names every value a conflict is between, once each", () => {
    expect(
      documentedValueText(
        specification({
          state: "CONFLICT",
          display: null,
          groups: [
            { display: "300Ω", normalized: "300", agreement: "CONFLICTS", sources: [] },
            { display: "330Ω", normalized: "330", agreement: "CONFLICTS", sources: [] },
            { display: "330Ω", normalized: "330", agreement: "CONFLICTS", sources: [] },
          ],
        }),
      ),
    ).toBe("300Ω · 330Ω");
  });

  it("falls back to a dash rather than rendering nothing", () => {
    expect(
      documentedValueText(
        specification({ display: null, sources: [], groups: [] }),
      ),
    ).toBe("—");
  });
});

describe("specificationEvidenceExcerpt", () => {
  it("returns the extractor's own text, whitespace collapsed", () => {
    expect(specificationEvidenceExcerpt(evidence({ text: "  a\n  b  " }))).toBe(
      "a b",
    );
  });

  it("truncates rather than letting one excerpt fill the modal", () => {
    const excerpt = specificationEvidenceExcerpt(
      evidence({ text: "x".repeat(500) }),
      40,
    );
    expect(excerpt).toHaveLength(40);
    expect(excerpt?.endsWith("…")).toBe(true);
  });

  it("returns null when the extractor recorded no text", () => {
    expect(specificationEvidenceExcerpt(evidence({ text: null }))).toBeNull();
    expect(specificationEvidenceExcerpt(evidence({ text: "   " }))).toBeNull();
  });
});
