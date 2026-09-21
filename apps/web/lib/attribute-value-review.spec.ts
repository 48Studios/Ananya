import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type {
  ApplyComponentFindingResultDto,
  ComponentReviewFindingDto,
} from "./api/component-review-queue-api";
import type {
  AttributeCandidateDto,
  DocumentAnalysisDto,
  DocumentAnalysisStateDto,
} from "./api/documentation-intelligence-api";
import {
  CANDIDATE_ACTION_PENDING_COPY,
  CANDIDATE_FILTERS,
  CANDIDATE_REVIEW_STATE_LABELS,
  applyApplicationToAnalysis,
  applyDecisionToAnalysis,
  applyUnavailableReason,
  attributeApplySuccessMessage,
  buildCandidateFilterCounts,
  canApplyCandidate,
  canDecideCandidate,
  candidateOutcomeNotice,
  candidateReviewStateLabel,
  candidateStatusBadge,
  filterCandidates,
  inapplicableReasonLabel,
  matchesCandidateFilter,
  reviewSectionHeading,
  summariseCandidateReview,
  updateAnalysisInState,
  type CandidateFilterId,
} from "./attribute-value-review";

/**
 * Pass 3 frontend coverage for Attribute Value Review.
 *
 * The review controls live inside the datasheet analysis dialog, so the rules
 * that decide which control a reviewer is offered are asserted directly here,
 * and the rendering claims are source assertions over the real component (this
 * workspace has no DOM testing library).
 */

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (absolutePath: string) => fs.readFileSync(absolutePath, "utf8");

const dialogPath = path.join(
  webRoot,
  "components/documentation/document-analysis-dialog.tsx",
);
const reviewLibPath = path.join(webRoot, "lib/attribute-value-review.ts");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function candidate(
  overrides: Partial<AttributeCandidateDto> = {},
): AttributeCandidateDto {
  return {
    extractedCode: "resistance",
    formatted: "330 Ω",
    unit: "ohm",
    rawValue: 330,
    confidence: 0.92,
    confidenceLevel: "HIGH",
    evidence: [],
    resolution: "DEFINITION_MATCHED",
    resolutionDetail: null,
    attributeDefinitionId: "def-resistance",
    attributeCode: "resistance",
    attributeName: "Resistance",
    dataType: "QUANTITY",
    normalizedValue: { value: 330, unit: "ohm" },
    optionCode: null,
    currentValue: null,
    conflict: false,
    resolutionState: "RESOLVED",
    validationState: "VALID",
    validationReason: null,
    applicable: true,
    inapplicableReason: null,
    validationDetail: null,
    review: {
      findingId: "finding-1",
      status: "PENDING",
      fingerprint: "fp-1",
      isNew: true,
      applied: false,
    },
    resolutionConfidence: 0.96,
    resolutionReasons: ["the attribute code matches the extracted property exactly"],
    resolutionCandidates: [],
    ...overrides,
  };
}

function analysis(
  attributes: AttributeCandidateDto[],
): DocumentAnalysisDto {
  return { attributes } as unknown as DocumentAnalysisDto;
}

function finding(
  overrides: Partial<ComponentReviewFindingDto> = {},
): ComponentReviewFindingDto {
  return {
    id: "finding-1",
    fingerprint: "fp-1",
    status: "PENDING",
    ...overrides,
  } as ComponentReviewFindingDto;
}

function applyResult(
  overrides: Partial<ApplyComponentFindingResultDto> = {},
): ApplyComponentFindingResultDto {
  return {
    findingId: "finding-1",
    issueType: "ATTRIBUTE_VALUE_SUGGESTION",
    field: "attributes",
    fieldLabel: "Resistance",
    appliedValue: "330 ohm",
    appliedValueLabel: "330 Ω",
    previousValue: null,
    component: { id: "comp-1", sku: "SKU-1", name: "Resistor" },
    ...overrides,
  } as ApplyComponentFindingResultDto;
}

// ---------------------------------------------------------------------------
// Review state
// ---------------------------------------------------------------------------

describe("Attribute Value Review states", () => {
  it("labels every review status a finding can hold", () => {
    expect(Object.keys(CANDIDATE_REVIEW_STATE_LABELS).sort()).toEqual([
      "ACCEPTED",
      "DISMISSED",
      "PENDING",
      "REJECTED",
      "STALE",
    ]);
    expect(candidateReviewStateLabel("PENDING")).toBe("Awaiting review");
    expect(candidateReviewStateLabel("STALE")).toBe(
      "Stale — re-analyze required",
    );
  });

  it("returns null when there is no review state to describe", () => {
    expect(candidateReviewStateLabel(null)).toBeNull();
    expect(candidateReviewStateLabel(undefined)).toBeNull();
  });

  it("explains every reason a specification is not actionable", () => {
    expect(inapplicableReasonLabel("ATTRIBUTE_NOT_FOUND")).toBe(
      "Attribute definition not found",
    );
    expect(inapplicableReasonLabel("AMBIGUOUS_ATTRIBUTE")).toBe(
      "Matches more than one attribute",
    );
    expect(inapplicableReasonLabel("ATTRIBUTE_NOT_ACTIVE")).toBe(
      "Attribute definition is inactive",
    );
    expect(inapplicableReasonLabel(null)).toBeNull();
  });

  it("prefers the applied state in the row badge", () => {
    // An applied finding is still ACCEPTED in the queue, but the row must say
    // applied: the reviewer needs to know the component was written.
    expect(
      candidateStatusBadge(
        candidate({
          review: {
            findingId: "finding-1",
            status: "ACCEPTED",
            fingerprint: "fp-1",
            isNew: false,
            applied: true,
          },
        }),
      ),
    ).toBe("Applied");
  });

  it("shows the review status, the inapplicable reason, or nothing yet", () => {
    expect(candidateStatusBadge(candidate())).toBe("Awaiting review");
    expect(
      candidateStatusBadge(
        candidate({
          applicable: false,
          inapplicableReason: "VALUE_ALREADY_CURRENT",
          review: null,
        }),
      ),
    ).toBe("Component already records this value");
    expect(
      candidateStatusBadge(candidate({ conflict: true, review: null })),
    ).toBe("Conflict");
    expect(candidateStatusBadge(candidate({ review: null }))).toBe(
      "Not analyzed",
    );
  });
});

// ---------------------------------------------------------------------------
// Action availability
// ---------------------------------------------------------------------------

describe("Attribute Value Review action availability", () => {
  it("offers Apply only for an accepted-by-default, applicable suggestion", () => {
    expect(canApplyCandidate(candidate(), true)).toBe(true);
  });

  it("never offers Apply without the component write permission", () => {
    expect(canApplyCandidate(candidate(), false)).toBe(false);
    expect(canDecideCandidate(candidate(), false)).toBe(false);
  });

  it("never offers Apply for a value that is not actionable", () => {
    expect(
      canApplyCandidate(
        candidate({
          applicable: false,
          validationState: "INVALID",
          inapplicableReason: "INVALID_VALUE",
        }),
        true,
      ),
    ).toBe(false);
  });

  it("never offers Apply for a closed or applied finding", () => {
    for (const status of ["REJECTED", "DISMISSED"] as const) {
      const closed = candidate({
        review: {
          findingId: "finding-1",
          status,
          fingerprint: "fp-1",
          isNew: false,
          applied: false,
        },
      });
      expect(canApplyCandidate(closed, true)).toBe(false);
      expect(canDecideCandidate(closed, true)).toBe(false);
    }

    const applied = candidate({
      review: {
        findingId: "finding-1",
        status: "ACCEPTED",
        fingerprint: "fp-1",
        isNew: false,
        applied: true,
      },
    });
    expect(canApplyCandidate(applied, true)).toBe(false);
  });

  it("never offers Apply for a stale suggestion", () => {
    const stale = candidate({
      review: {
        findingId: "finding-1",
        status: "STALE",
        fingerprint: "fp-1",
        isNew: false,
        applied: false,
      },
    });
    expect(canApplyCandidate(stale, true)).toBe(false);
    // A stale suggestion still needs a decision, so the row must offer one.
    expect(canDecideCandidate(stale, true)).toBe(true);
  });

  it("never offers Apply when analysis created no review item", () => {
    const unreviewed = candidate({ review: null });
    expect(canApplyCandidate(unreviewed, true)).toBe(false);
    expect(canDecideCandidate(unreviewed, true)).toBe(false);
    expect(applyUnavailableReason(unreviewed, true)).toBe(
      "Analysis did not create a review item for this specification.",
    );
  });

  it("states the reason Apply is withheld", () => {
    const stale = candidate({
      review: {
        findingId: "finding-1",
        status: "STALE",
        fingerprint: "fp-1",
        isNew: false,
        applied: false,
      },
    });
    expect(applyUnavailableReason(stale, true)).toContain("stale");

    const applied = candidate({
      review: {
        findingId: "finding-1",
        status: "ACCEPTED",
        fingerprint: "fp-1",
        isNew: false,
        applied: true,
      },
    });
    expect(applyUnavailableReason(applied, true)).toContain("already applied");

    const rejected = candidate({
      review: {
        findingId: "finding-1",
        status: "REJECTED",
        fingerprint: "fp-1",
        isNew: false,
        applied: false,
      },
    });
    expect(applyUnavailableReason(rejected, true)).toContain("closed");

    const notActionable = candidate({
      applicable: false,
      inapplicableReason: "AMBIGUOUS_ATTRIBUTE",
    });
    expect(applyUnavailableReason(notActionable, true)).toBe(
      "Matches more than one attribute",
    );

    expect(applyUnavailableReason(candidate(), false)).toContain(
      "Inventory.Update",
    );

    // An accepted suggestion is applicable, so the only bar is the Apply click.
    const accepted = candidate({
      review: {
        findingId: "finding-1",
        status: "ACCEPTED",
        fingerprint: "fp-1",
        isNew: false,
        applied: false,
      },
    });
    expect(applyUnavailableReason(accepted, true)).toContain("accepted");
  });

  it("says nothing when Apply is available", () => {
    expect(applyUnavailableReason(candidate(), true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Outcome notices
// ---------------------------------------------------------------------------

describe("Attribute Value Review outcome notices", () => {
  it("distinguishes acceptance from application", () => {
    const accepted = candidate({
      review: {
        findingId: "finding-1",
        status: "ACCEPTED",
        fingerprint: "fp-1",
        isNew: false,
        applied: false,
      },
    });
    expect(candidateOutcomeNotice(accepted)).toContain(
      "Nothing has been written",
    );

    const applied = candidate({
      currentValue: "330 Ω",
      review: {
        findingId: "finding-1",
        status: "ACCEPTED",
        fingerprint: "fp-1",
        isNew: false,
        applied: true,
      },
    });
    expect(candidateOutcomeNotice(applied)).toContain("330 Ω");
  });

  it("confirms that closing a suggestion left the component alone", () => {
    for (const status of ["REJECTED", "DISMISSED"] as const) {
      const closed = candidate({
        review: {
          findingId: "finding-1",
          status,
          fingerprint: "fp-1",
          isNew: false,
          applied: false,
        },
      });
      expect(candidateOutcomeNotice(closed)).toContain(
        "component was not modified",
      );
    }
  });

  it("says nothing for a suggestion still awaiting review", () => {
    expect(candidateOutcomeNotice(candidate())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

describe("Attribute Value Review filters", () => {
  it("offers the canonical filter set", () => {
    expect(CANDIDATE_FILTERS.map((filter) => filter.id)).toEqual([
      "ALL",
      "NEEDS_REVIEW",
      "CONFLICTS",
      "ACCEPTED",
      "APPLIED",
      "INVALID",
    ]);
  });

  const pending = candidate();
  const conflict = candidate({
    extractedCode: "tolerance",
    currentValue: "1 %",
    conflict: true,
  });
  const invalid = candidate({
    extractedCode: "voltage",
    applicable: false,
    validationState: "INVALID",
    validationReason: "UNIT_MISMATCH",
    inapplicableReason: "INVALID_VALUE",
  });
  const accepted = candidate({
    extractedCode: "power",
    review: {
      findingId: "finding-2",
      status: "ACCEPTED",
      fingerprint: "fp-2",
      isNew: false,
      applied: false,
    },
  });
  const applied = candidate({
    extractedCode: "mounting",
    review: {
      findingId: "finding-3",
      status: "ACCEPTED",
      fingerprint: "fp-3",
      isNew: false,
      applied: true,
    },
  });

  const all = [pending, conflict, invalid, accepted, applied];

  it("classifies each specification into its filters", () => {
    expect(matchesCandidateFilter(pending, "NEEDS_REVIEW")).toBe(true);
    expect(matchesCandidateFilter(conflict, "CONFLICTS")).toBe(true);
    expect(matchesCandidateFilter(invalid, "INVALID")).toBe(true);
    expect(matchesCandidateFilter(accepted, "ACCEPTED")).toBe(true);
    expect(matchesCandidateFilter(applied, "APPLIED")).toBe(true);

    expect(matchesCandidateFilter(applied, "ACCEPTED")).toBe(false);
    expect(matchesCandidateFilter(accepted, "APPLIED")).toBe(false);
    expect(matchesCandidateFilter(invalid, "NEEDS_REVIEW")).toBe(false);
    expect(all.every((item) => matchesCandidateFilter(item, "ALL"))).toBe(true);
  });

  it("counts every filter from the loaded candidates", () => {
    const counts = buildCandidateFilterCounts(all);
    const expected: Record<CandidateFilterId, number> = {
      ALL: 5,
      NEEDS_REVIEW: 2,
      CONFLICTS: 1,
      ACCEPTED: 1,
      APPLIED: 1,
      INVALID: 1,
    };
    expect(counts).toEqual(expected);
  });

  it("filters without dropping candidates from the source list", () => {
    expect(filterCandidates(all, "APPLIED").map((item) => item.extractedCode)).toEqual(
      ["mounting"],
    );
    expect(all).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Review progress
// ---------------------------------------------------------------------------

describe("Attribute Value Review progress", () => {
  it("reports nothing when an analysis produced no actionable specification", () => {
    expect(summariseCandidateReview([])).toBeNull();
    expect(
      summariseCandidateReview([
        candidate({ applicable: false, inapplicableReason: "INVALID_VALUE" }),
      ]),
    ).toBeNull();
  });

  it("counts pending, accepted, applied, and not-actionable separately", () => {
    const summary = summariseCandidateReview([
      candidate(),
      candidate({
        review: {
          findingId: "finding-2",
          status: "ACCEPTED",
          fingerprint: "fp-2",
          isNew: false,
          applied: false,
        },
      }),
      candidate({
        review: {
          findingId: "finding-3",
          status: "ACCEPTED",
          fingerprint: "fp-3",
          isNew: false,
          applied: true,
        },
      }),
      candidate({ applicable: false, inapplicableReason: "INVALID_VALUE" }),
    ]);

    expect(summary).toEqual({
      total: 4,
      pending: 1,
      accepted: 1,
      applied: 1,
      notActionable: 1,
    });
  });

  it("states how many specifications can be actioned in the heading", () => {
    expect(
      reviewSectionHeading([
        candidate(),
        candidate({ applicable: false, inapplicableReason: "INVALID_VALUE" }),
      ]),
    ).toBe("Extracted specifications (1 of 2 actionable)");
  });
});

// ---------------------------------------------------------------------------
// Targeted state updates
// ---------------------------------------------------------------------------

describe("Attribute Value Review state updates", () => {
  const other = candidate({
    extractedCode: "tolerance",
    review: {
      findingId: "finding-2",
      status: "PENDING",
      fingerprint: "fp-2",
      isNew: true,
      applied: false,
    },
  });

  it("rewrites only the specification the finding belongs to", () => {
    const next = applyDecisionToAnalysis(analysis([candidate(), other]), finding({
      status: "ACCEPTED",
    }));

    expect(next.attributes[0]?.review?.status).toBe("ACCEPTED");
    expect(next.attributes[0]?.review?.isNew).toBe(false);
    expect(next.attributes[1]).toEqual(other);
  });

  it("matches by fingerprint rather than position", () => {
    const next = applyDecisionToAnalysis(
      analysis([other, candidate()]),
      finding({ status: "REJECTED" }),
    );

    expect(next.attributes[0]).toEqual(other);
    expect(next.attributes[1]?.review?.status).toBe("REJECTED");
  });

  it("leaves the analysis untouched when no candidate matches", () => {
    const before = analysis([other]);
    const next = applyDecisionToAnalysis(before, finding());
    expect(next.attributes).toEqual(before.attributes);
  });

  it("records application together with the value now on the component", () => {
    const next = applyApplicationToAnalysis(
      analysis([candidate(), other]),
      finding({ status: "ACCEPTED" }),
      applyResult(),
    );

    const updated = next.attributes[0];
    expect(updated?.review?.applied).toBe(true);
    expect(updated?.review?.status).toBe("ACCEPTED");
    expect(updated?.currentValue).toBe("330 Ω");
    expect(updated?.conflict).toBe(false);
  });

  it("falls back to the raw value when the API sends no display label", () => {
    const next = applyApplicationToAnalysis(
      analysis([candidate()]),
      finding(),
      applyResult({ appliedValueLabel: null }),
    );
    expect(next.attributes[0]?.currentValue).toBe("330 ohm");
  });

  it("updates the cached analysis and its latest copy in place", () => {
    const docAnalysis = analysis([candidate()]);
    const state: Record<string, DocumentAnalysisStateDto> = {
      "doc-1": {
        analysis: docAnalysis,
        latestAnalysis: docAnalysis,
      } as unknown as DocumentAnalysisStateDto,
      "doc-2": {
        analysis: analysis([other]),
        latestAnalysis: null,
      } as unknown as DocumentAnalysisStateDto,
    };

    const next = updateAnalysisInState(state, "doc-1", (current) =>
      applyDecisionToAnalysis(current, finding({ status: "ACCEPTED" })),
    );

    expect(next["doc-1"]?.analysis?.attributes[0]?.review?.status).toBe(
      "ACCEPTED",
    );
    expect(next["doc-1"]?.latestAnalysis?.attributes[0]?.review?.status).toBe(
      "ACCEPTED",
    );
    expect(next["doc-2"]).toBe(state["doc-2"]);
  });

  it("returns the same map when the document has no analysis cached", () => {
    const state: Record<string, DocumentAnalysisStateDto> = {};
    expect(
      updateAnalysisInState(state, "doc-missing", (current) => current),
    ).toBe(state);
  });

  it("states the applied value in the success message", () => {
    expect(attributeApplySuccessMessage(applyResult())).toBe(
      'Resistance set to "330 Ω" on the component.',
    );
    expect(
      attributeApplySuccessMessage(applyResult({ appliedValueLabel: null })),
    ).toBe('Resistance set to "330 ohm" on the component.');
  });

  it("says something while an action is in flight", () => {
    expect(CANDIDATE_ACTION_PENDING_COPY.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Rendering (source assertions)
// ---------------------------------------------------------------------------

describe("document analysis dialog renders specification review", () => {
  const source = read(dialogPath);

  it("renders one reviewable row per extracted specification", () => {
    expect(source).toContain("function SpecificationRow(");
    expect(source).toContain("<SpecificationRow");
    expect(source).toContain("visibleCandidates.map(");
  });

  it("shows the current value, the suggested value, and the source page", () => {
    expect(source).toContain("Current:");
    expect(source).toContain("Suggested:");
    expect(source).toContain("candidateValueText(candidate)");
    expect(source).toContain("<EvidenceList evidence={candidate.evidence} />");
  });

  it("drives every control from the shared presentation rules", () => {
    expect(source).toContain("canApplyCandidate(candidate, canWrite)");
    expect(source).toContain("canDecideCandidate(candidate, canWrite)");
    expect(source).toContain("applyUnavailableReason(candidate, canWrite)");
    expect(source).toContain("candidateStatusBadge(candidate)");
  });

  it("offers the review filters with their counts", () => {
    expect(source).toContain("CANDIDATE_FILTERS.map(");
    expect(source).toContain("filterCounts?.[filter.id] ?? 0");
  });

  it("records decisions and applies through the review queue API", () => {
    expect(source).toContain("componentReviewQueueApi.recordDecision(");
    expect(source).toContain("componentReviewQueueApi.applyFinding(");
    expect(source).toContain("applyDecisionToAnalysis(");
    expect(source).toContain("applyApplicationToAnalysis(");
  });

  it("keeps the review logic out of the component itself", () => {
    // The dialog may only orchestrate; every rule lives in the lib module.
    expect(source).not.toContain("fingerprint ===");
    expect(source).not.toContain('"APPLIED"');
    expect(read(reviewLibPath)).toContain("export function canApplyCandidate(");
  });
});
