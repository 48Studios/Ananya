import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type {
  ComponentDocumentationSummaryDto,
  SpecificationAggregateDto,
  SpecificationSourceDto,
  UnmappedSpecificationDto,
} from "./api/documentation-intelligence-api";
import {
  SPECIFICATION_FILTERS,
  ambiguityHeading,
  buildSpecificationFilterCounts,
  buildSummaryRows,
  canApplySpecification,
  canDecideSpecification,
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
  emptySpecificationMessage,
  evidenceRoleLabel,
  filterSpecifications,
  hasPrimaryEvidence,
  isAmbiguous,
  matchesSpecificationFilter,
  sectionLabel,
  sourceErpLabel,
  specificationBadge,
  specificationStateLabel,
  specificationUnavailableReason,
} from "./specification-intelligence";

/**
 * Pass 4 frontend coverage for Specification Intelligence.
 *
 * Pure logic is exercised directly; rendering claims are source assertions over
 * the real component, because this workspace has no DOM testing library.
 */
const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (absolutePath: string) => fs.readFileSync(absolutePath, "utf8");
const panelPath = path.join(
  webRoot,
  "components/documentation/component-specification-intelligence-panel.tsx",
);

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
// Summary
// ---------------------------------------------------------------------------

describe("summary strip", () => {
  it("reports the server-derived counts", () => {
    const rows = buildSummaryRows(summary());
    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    expect(byKey.get("documents")).toBe(3);
    expect(byKey.get("specifications")).toBe(18);
    expect(byKey.get("needsReview")).toBe(3);
    expect(byKey.get("applied")).toBe(11);
    expect(byKey.get("conflicts")).toBe(2);
    expect(byKey.get("ambiguous")).toBe(2);
    expect(byKey.get("unresolved")).toBe(1);
    expect(byKey.get("alreadyCurrent")).toBe(4);
  });

  it("omits empty rows but always shows the two headline counts", () => {
    const rows = buildSummaryRows(
      summary({
        documentsAnalyzed: 0,
        specificationsFound: 0,
        needsReview: 0,
        applied: 0,
        conflicts: 0,
        ambiguous: 0,
        unresolved: 0,
        alreadyCurrent: 0,
      }),
    );

    expect(rows.map((row) => row.key)).toEqual(["documents", "specifications"]);
  });

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
    expect(counts.NEEDS_REVIEW).toBe(1);
    expect(counts.CONFLICTS).toBe(1);
    expect(counts.ALREADY_CURRENT).toBe(1);
    expect(counts.APPLIED).toBe(0);
    // Ambiguity is a property of an unmapped property, not of an aggregate.
    expect(counts.AMBIGUOUS).toBe(1);
  });

  it("filters without dropping the source list", () => {
    const all = [specification(), specification({ state: "CONFLICT" })];
    expect(filterSpecifications(all, "CONFLICTS")).toHaveLength(1);
    expect(filterSpecifications(all, "AMBIGUOUS")).toEqual([]);
    expect(all).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Rendering (source assertions)
// ---------------------------------------------------------------------------

describe("specification intelligence panel", () => {
  const source_ = read(panelPath);

  it("renders the summary from the server counts", () => {
    expect(source_).toContain("buildSummaryRows");
    expect(source_).toContain("componentSpecificationApi");
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
});
