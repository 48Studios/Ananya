import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ATTRIBUTE_APPLY_CONFLICT_REASONS,
  ATTRIBUTE_APPLY_LABELS,
  ATTRIBUTE_DECISION_COPY,
  ATTRIBUTE_ISSUE_TYPES_BY_TAB,
  ATTRIBUTE_QUEUE_TABS,
  ATTRIBUTE_READ_PERMISSION,
  ATTRIBUTE_STATUS_BADGES,
  ATTRIBUTE_STATUS_LABELS,
  ATTRIBUTE_WRITE_PERMISSION,
  attributeAcceptNotice,
  attributeApplyAction,
  attributeApplyConfirmation,
  attributeApplyConflictMessage,
  attributeApplyLabel,
  attributeApplySubject,
  attributeApplySuccessMessage,
  attributeApplyUnavailableReason,
  attributeApplicationLabel,
  attributeAppliedSummary,
  attributeAuditConflictMessage,
  attributeAuditUnavailableReason,
  attributeDecisionConflictMessage,
  attributeDefinitionProposal,
  attributeIssueTypeLabel,
  attributeReviewReadOnlyNotice,
  attributeStatusBadge,
  attributeStatusLabel,
  buildAttributeTabCounts,
  canApplyAttributeFinding,
  canDecideAttributeFinding,
  confidenceBadgeStatus,
  deriveAttributeReviewPermissions,
  findingHeadline,
  findingMatchesTab,
  findingSubjectLabels,
  isAttributeApplyConflictReason,
  isAttributeFindingApplied,
  isExpectationForUndefinedAttribute,
  producerIssueTypeLabel,
  producerUsageEvidence,
  statusFilterAfterApply,
  suggestedCanonicalCode,
  summarizeAttributeAudit,
  tabIssueTypeFilter,
} from "./attribute-review-queue";
import type {
  AttributeReviewFindingDto,
  AttributeReviewQueueCountsDto,
} from "./api/attribute-review-queue-api";
import {
  DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE,
  MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
  buildAttributeApplyPayload,
  buildAttributeDecisionPayload,
} from "./api/attribute-review-queue-api";

/**
 * Attribute review queue presentation logic.
 *
 * The queue is a persisted review workflow, so these tests pin the three things
 * that must not drift: the taxonomy mapping onto the existing tabs, the lifecycle
 * rules the UI offers (which must match the backend's transitions), and the fact
 * that a decision carries no mutation.
 *
 * The rendering claims (which call the dialog makes, and which it must NOT) are
 * asserted by scanning the dialog source, matching this workspace's convention:
 * `apps/web` has no DOM test library.
 */

const finding = (
  overrides: Partial<AttributeReviewFindingDto> = {},
): AttributeReviewFindingDto => ({
  id: "11111111-1111-4111-8111-111111111111",
  attributeDefinitionId: "attr-1",
  relatedAttributeDefinitionId: null,
  categoryId: null,
  optionId: null,
  issueType: "UNUSED_ATTRIBUTE",
  issueCategory: "ATTRIBUTE_USAGE",
  field: null,
  title: "Unused Attribute: Voltage Rating",
  description: "Attribute has no bindings and no component values.",
  currentValue: { usageBand: "NO_VALUES_NO_BINDINGS" },
  suggestedValue: null,
  confidence: 0.75,
  confidenceLevel: "MEDIUM",
  evidence: [],
  source: "audit:attribute-library:deterministic",
  modelVersion: "1.0.0",
  intelligenceVersion: "attribute-audit-v1",
  fingerprint: "f".repeat(64),
  status: "PENDING",
  applicationResult: "NOT_APPLIED",
  reviewerId: null,
  reviewerEmail: null,
  reviewedAt: null,
  decisionNotes: null,
  metadata: {},
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
  ...overrides,
});

const counts = (
  overrides: Partial<AttributeReviewQueueCountsDto> = {},
): AttributeReviewQueueCountsDto => ({
  total: 0,
  pending: 0,
  accepted: 0,
  rejected: 0,
  dismissed: 0,
  stale: 0,
  byCategory: {},
  byIssueType: {},
  applicationResults: { NOT_APPLIED: 0, APPLIED: 0 },
  readyToApply: 0,
  ...overrides,
});

describe("Attribute review queue — taxonomy mapping", () => {
  it('maps each persisted issue type onto an existing tab', () => {
    expect(
      findingMatchesTab({ issueType: "POSSIBLE_DUPLICATE" }, "DUPLICATES"),
    ).toBe(true);
    expect(
      findingMatchesTab({ issueType: "DUPLICATE_ATTRIBUTE" }, "DUPLICATES"),
    ).toBe(true);
    expect(
      findingMatchesTab({ issueType: "MISSING_EXPECTED_ATTRIBUTE" }, "BINDINGS"),
    ).toBe(true);
    expect(
      findingMatchesTab({ issueType: "SUGGESTED_BINDING" }, "BINDINGS"),
    ).toBe(true);
    expect(
      findingMatchesTab({ issueType: "SUSPICIOUS_BINDING" }, "SUSPICIOUS"),
    ).toBe(true);
    expect(findingMatchesTab({ issueType: "UNUSED_ATTRIBUTE" }, "UNUSED")).toBe(
      true,
    );
    expect(findingMatchesTab({ issueType: "SUGGESTED_ENUM_VALUE" }, "ENUMS")).toBe(
      true,
    );
  });

  it('places every taxonomy type in exactly one tab', () => {
    const allTypes = Object.values(ATTRIBUTE_ISSUE_TYPES_BY_TAB).flat();
    expect(new Set(allTypes).size).toBe(allTypes.length);
  });

  it('treats ALL as unfiltered and rejects cross-tab membership', () => {
    expect(findingMatchesTab({ issueType: "UNUSED_ATTRIBUTE" }, "ALL")).toBe(
      true,
    );
    expect(
      findingMatchesTab({ issueType: "UNUSED_ATTRIBUTE" }, "DUPLICATES"),
    ).toBe(false);
    expect(
      findingMatchesTab({ issueType: "SUSPICIOUS_BINDING" }, "BINDINGS"),
    ).toBe(false);
  });

  it('builds a comma-separated server filter per tab and none for ALL', () => {
    expect(tabIssueTypeFilter("ALL")).toBeUndefined();
    expect(tabIssueTypeFilter("BINDINGS")).toBe(
      "MISSING_EXPECTED_ATTRIBUTE,SUGGESTED_BINDING",
    );
    expect(tabIssueTypeFilter("UNUSED")).toBe("UNUSED_ATTRIBUTE");
  });

  it('exposes the queue tabs in the order the UI renders them', () => {
    expect(ATTRIBUTE_QUEUE_TABS.map((tab) => tab.id)).toEqual([
      "ALL",
      "BINDINGS",
      "DUPLICATES",
      "SUSPICIOUS",
      "UNUSED",
      "ENUMS",
    ]);
  });
});

describe("Attribute review queue — counts", () => {
  it('derives every tab count from persisted grouped counts', () => {
    const tabCounts = buildAttributeTabCounts(
      counts({
        total: 9,
        byIssueType: {
          UNUSED_ATTRIBUTE: 1,
          POSSIBLE_DUPLICATE: 3,
          DUPLICATE_ATTRIBUTE: 0,
          SUSPICIOUS_BINDING: 2,
          MISSING_EXPECTED_ATTRIBUTE: 3,
        },
      }),
    );

    expect(tabCounts.ALL).toBe(9);
    expect(tabCounts.UNUSED).toBe(1);
    expect(tabCounts.DUPLICATES).toBe(3);
    expect(tabCounts.SUSPICIOUS).toBe(2);
    expect(tabCounts.BINDINGS).toBe(3);
    // Nothing produces enum suggestions today, so the tab is legitimately empty.
    expect(tabCounts.ENUMS).toBe(0);
  });

  it('reports zeroes when counts are unavailable rather than NaN', () => {
    const tabCounts = buildAttributeTabCounts(null);
    expect(Object.values(tabCounts).every((value) => value === 0)).toBe(true);
  });
});

describe("Attribute review queue — lifecycle presentation", () => {
  it('labels and badges every lifecycle status', () => {
    for (const status of [
      "PENDING",
      "ACCEPTED",
      "REJECTED",
      "DISMISSED",
      "STALE",
    ] as const) {
      expect(ATTRIBUTE_STATUS_LABELS[status]).toBeTruthy();
      expect(ATTRIBUTE_STATUS_BADGES[status]).toBeTruthy();
      expect(attributeStatusLabel(status)).toBe(ATTRIBUTE_STATUS_LABELS[status]);
      expect(attributeStatusBadge(status)).toBe(ATTRIBUTE_STATUS_BADGES[status]);
    }
  });

  it('falls back to the raw value for an unknown status', () => {
    expect(attributeStatusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(attributeStatusBadge("SOMETHING_NEW")).toBe("DRAFT");
  });

  it('maps confidence levels onto badge tones', () => {
    expect(confidenceBadgeStatus("HIGH")).toBe("SUCCESS");
    expect(confidenceBadgeStatus("MEDIUM")).toBe("IN_REVIEW");
    expect(confidenceBadgeStatus("LOW")).toBe("DRAFT");
    expect(confidenceBadgeStatus(null)).toBe("DRAFT");
  });

  it('labels persisted issue types, falling back to the raw value', () => {
    expect(attributeIssueTypeLabel("UNUSED_ATTRIBUTE")).toBe("Unused attribute");
    expect(attributeIssueTypeLabel("NOT_A_TYPE")).toBe("NOT_A_TYPE");
  });

  it('mirrors the backend decision transitions', () => {
    // ACCEPTED is impossible from STALE: the backend refuses it, so the UI must
    // not offer it.
    expect(canDecideAttributeFinding({ status: "PENDING" }, "ACCEPTED")).toBe(
      true,
    );
    expect(canDecideAttributeFinding({ status: "STALE" }, "ACCEPTED")).toBe(
      false,
    );
    expect(canDecideAttributeFinding({ status: "STALE" }, "REJECTED")).toBe(
      true,
    );
    expect(canDecideAttributeFinding({ status: "STALE" }, "DISMISSED")).toBe(
      true,
    );
    for (const decided of ["ACCEPTED", "REJECTED", "DISMISSED"] as const) {
      expect(canDecideAttributeFinding({ status: decided }, "ACCEPTED")).toBe(
        false,
      );
      expect(canDecideAttributeFinding({ status: decided }, "REJECTED")).toBe(
        false,
      );
      expect(canDecideAttributeFinding({ status: decided }, "DISMISSED")).toBe(
        false,
      );
    }
  });
});

describe("Attribute review queue — permissions", () => {
  it('uses the existing inventory vocabulary', () => {
    expect(ATTRIBUTE_WRITE_PERMISSION).toBe("Inventory.Update");
    expect(ATTRIBUTE_READ_PERMISSION).toBe("Inventory.Read");
  });

  it('grants decide, audit and apply together, and marks read-only otherwise', () => {
    const writer = deriveAttributeReviewPermissions(true);
    expect(writer.canDecide).toBe(true);
    expect(writer.canAudit).toBe(true);
    expect(writer.canApply).toBe(true);
    expect(writer.isReadOnly).toBe(false);

    const reader = deriveAttributeReviewPermissions(false);
    expect(reader.canDecide).toBe(false);
    expect(reader.canAudit).toBe(false);
    expect(reader.canApply).toBe(false);
    expect(reader.isReadOnly).toBe(true);
  });

  it('derives apply from the same write permission as every other mutation', () => {
    // Applying changes the attribute library, so it may not be granted by any
    // other condition. The capability list is pinned so a future permission
    // cannot be added without deciding whether it mutates.
    const permissions = deriveAttributeReviewPermissions(true);
    expect(Object.keys(permissions).sort()).toEqual([
      "canApply",
      "canAudit",
      "canDecide",
      "isReadOnly",
    ]);
    expect(deriveAttributeReviewPermissions(false).canApply).toBe(false);
  });

  it('explains read-only and audit unavailability, naming the permission', () => {
    expect(attributeReviewReadOnlyNotice()).toContain("Inventory.Update");
    expect(attributeAuditUnavailableReason(false)).toContain(
      "Inventory.Update",
    );
    expect(attributeAuditUnavailableReason(true)).toBeNull();
  });

  it('states explicitly that accepting does not change the library', () => {
    const notice = attributeAcceptNotice();
    expect(notice).toMatch(/no binding|nothing/i);
    expect(notice.toLowerCase()).toContain("no binding");
    // No copy may promise a mutation.
    for (const copy of Object.values(ATTRIBUTE_DECISION_COPY)) {
      expect(copy.summary.toLowerCase()).not.toMatch(
        /binding (was )?(created|added|removed)/,
      );
    }
    expect(ATTRIBUTE_DECISION_COPY.ACCEPTED.summary).toMatch(/later step/);
  });
});

describe("Attribute review queue — conflict messaging", () => {
  it('passes the backend message through on 409', () => {
    expect(
      attributeDecisionConflictMessage(409, "This finding is stale."),
    ).toBe("This finding is stale.");
  });

  it('explains 403 and 404 in the queue’s own terms', () => {
    expect(attributeDecisionConflictMessage(403, "")).toContain(
      "Inventory.Update",
    );
    expect(attributeDecisionConflictMessage(404, "")).toContain(
      "no longer exists",
    );
    expect(attributeDecisionConflictMessage(500, "boom")).toBeNull();
  });

  it('explains an in-flight audit conflict', () => {
    expect(attributeAuditConflictMessage(409)).toMatch(/already running/i);
    expect(attributeAuditConflictMessage(500)).toBeNull();
  });
});

describe("Attribute review queue — audit summary", () => {
  it('reports the counts the backend returned, including warnings', () => {
    const summary = summarizeAttributeAudit({
      persistedCount: 5,
      createdCount: 3,
      refreshedCount: 2,
      revivedCount: 1,
      staleCount: 4,
      warningCount: 2,
      isMlActive: false,
    });

    expect(summary).toContain("3 new");
    expect(summary).toContain("2 refreshed");
    expect(summary).toContain("1 revived");
    expect(summary).toContain("4 retired as stale");
    expect(summary).toContain("2 items could not be represented");
    expect(summary).toContain("Deterministic audit");
  });

  it('names the model-backed producer when it answered', () => {
    expect(
      summarizeAttributeAudit({
        persistedCount: 1,
        createdCount: 1,
        refreshedCount: 0,
        revivedCount: 0,
        staleCount: 0,
        warningCount: 0,
        isMlActive: true,
      }),
    ).toContain("Model-backed audit");
  });

  it('omits zero-valued clauses instead of padding the sentence', () => {
    const summary = summarizeAttributeAudit({
      persistedCount: 1,
      createdCount: 1,
      refreshedCount: 0,
      revivedCount: 0,
      staleCount: 0,
      warningCount: 0,
      isMlActive: false,
    });
    expect(summary).not.toContain("revived");
    expect(summary).not.toContain("retired as stale");
    expect(summary).not.toContain("could not be represented");
  });
});

describe("Attribute review queue — subject presentation", () => {
  it('reports the producer’s own type name when the finding records one', () => {
    expect(
      producerIssueTypeLabel(
        finding({ metadata: { producerIssueType: "DUPLICATE_ATTRIBUTE" } }),
      ),
    ).toBe("DUPLICATE_ATTRIBUTE");
    // The persisted type differs from the producer's for duplicates, which is why
    // the producer's own name is preserved.
    expect(
      producerIssueTypeLabel(
        finding({
          issueType: "POSSIBLE_DUPLICATE",
          metadata: { producerIssueType: "DUPLICATE_ATTRIBUTE" },
        }),
      ),
    ).toBe("DUPLICATE_ATTRIBUTE");
  });

  it('falls back to the persisted type when no producer name exists', () => {
    expect(producerIssueTypeLabel(finding({ metadata: {} }))).toBe(
      "UNUSED_ATTRIBUTE",
    );
  });

  it('reads the declared canonical code from the suggestion or metadata', () => {
    expect(
      suggestedCanonicalCode(
        finding({ suggestedValue: { canonicalCode: "voltage_rating" } }),
      ),
    ).toBe("voltage_rating");
    expect(
      suggestedCanonicalCode(finding({ metadata: { attributeCode: "dielectric" } })),
    ).toBe("dielectric");
    expect(suggestedCanonicalCode(finding())).toBeNull();
  });

  it('detects a category-first expectation with no definition to point at', () => {
    expect(
      isExpectationForUndefinedAttribute(
        finding({
          issueType: "MISSING_EXPECTED_ATTRIBUTE",
          attributeDefinitionId: null,
        }),
      ),
    ).toBe(true);
    expect(
      isExpectationForUndefinedAttribute(
        finding({
          issueType: "MISSING_EXPECTED_ATTRIBUTE",
          attributeDefinitionId: "attr-1",
        }),
      ),
    ).toBe(false);
    // An unused-attribute finding always has a subject, so it is never "undefined".
    expect(
      isExpectationForUndefinedAttribute(
        finding({ issueType: "UNUSED_ATTRIBUTE", attributeDefinitionId: null }),
      ),
    ).toBe(false);
  });

  it('reads producer usage observations defensively', () => {
    expect(
      producerUsageEvidence(
        finding({
          metadata: {
            producerObservations: {
              componentValueCount: 0,
              directBindingCount: 3,
            },
          },
        }),
      ),
    ).toEqual({ componentValueCount: 0, bindingCount: 3 });

    expect(producerUsageEvidence(finding({ metadata: {} }))).toEqual({
      componentValueCount: null,
      bindingCount: null,
    });
    // A non-numeric observation is reported as absent rather than rendered raw.
    expect(
      producerUsageEvidence(
        finding({ metadata: { producerObservations: { componentValueCount: "x" } } }),
      ),
    ).toEqual({ componentValueCount: null, bindingCount: null });
  });

  it('headlines a finding with its title, then description, then type', () => {
    expect(findingHeadline(finding({ title: "Custom" }))).toBe("Custom");
    expect(findingHeadline(finding({ title: "", description: "Fallback" }))).toBe(
      "Fallback",
    );
    expect(
      findingHeadline(finding({ title: "", description: "" })),
    ).toBe("Unused attribute");
  });
});

describe("Attribute review queue — subject labels", () => {
  const ATTRIBUTE_ID = "cef9ffa0-6e98-406d-b5d3-024c56b669a1";
  const CATEGORY_ID = "5616c40c-f8a7-4d73-ab80-347fda515576";

  const attributeSnapshot = (overrides: Record<string, unknown> = {}) => ({
    id: ATTRIBUTE_ID,
    code: "resistance",
    name: "Resistance",
    ...overrides,
  });
  const categorySnapshot = (overrides: Record<string, unknown> = {}) => ({
    id: CATEGORY_ID,
    code: "CAP",
    name: "Capacitors",
    ...overrides,
  });

  it('names the attribute and the category instead of showing their ids', () => {
    // The persisted expected-state snapshot carries both names, so the row never
    // needs a second request — nor a uuid.
    const labels = findingSubjectLabels(
      finding({
        issueType: "SUSPICIOUS_BINDING",
        attributeDefinitionId: ATTRIBUTE_ID,
        categoryId: CATEGORY_ID,
        currentValue: {
          attribute: attributeSnapshot(),
          category: categorySnapshot(),
          bindingExists: true,
        },
      }),
    );

    expect(labels.attribute).toBe("Resistance");
    expect(labels.category).toBe("Capacitors");
    expect(labels.attribute).not.toBe(ATTRIBUTE_ID);
    expect(labels.category).not.toBe(CATEGORY_ID);
  });

  it('names an unused attribute from its own snapshot', () => {
    const labels = findingSubjectLabels(
      finding({
        issueType: "UNUSED_ATTRIBUTE",
        attributeDefinitionId: ATTRIBUTE_ID,
        currentValue: { attribute: attributeSnapshot(), usageBand: "ZERO" },
      }),
    );

    expect(labels.attribute).toBe("Resistance");
    // The family names no category at all, which the row states rather than fills in.
    expect(labels.category).toBeNull();
    expect(labels.relatedAttribute).toBeNull();
  });

  it('names the expected attribute of a category-first expectation', () => {
    // No definition exists yet, so there is no attribute row to name: the
    // producer's proposed name is the only human-readable identity available.
    const labels = findingSubjectLabels(
      finding({
        issueType: "MISSING_EXPECTED_ATTRIBUTE",
        attributeDefinitionId: null,
        categoryId: CATEGORY_ID,
        currentValue: {
          category: categorySnapshot(),
          expectedAttributeCode: "termination",
          expectedAttributeName: "Termination Style",
          existingAttribute: null,
        },
      }),
    );

    expect(labels.attribute).toBe("Termination Style");
    expect(labels.category).toBe("Capacitors");
  });

  it('names a resolved expectation from the definition it resolved to', () => {
    const labels = findingSubjectLabels(
      finding({
        issueType: "MISSING_EXPECTED_ATTRIBUTE",
        attributeDefinitionId: ATTRIBUTE_ID,
        categoryId: CATEGORY_ID,
        currentValue: {
          category: categorySnapshot(),
          expectedAttributeCode: "package",
          expectedAttributeName: "Package / Case",
          existingAttribute: attributeSnapshot({ name: "Package / Case" }),
        },
      }),
    );

    expect(labels.attribute).toBe("Package / Case");
    expect(labels.category).toBe("Capacitors");
  });

  it('separates the two sides of a duplicate pair by id', () => {
    // The pair is canonicalized, so position is not the finding's own subject: the
    // side carrying the finding's id is the attribute, the other is the match.
    const labels = findingSubjectLabels(
      finding({
        issueType: "POSSIBLE_DUPLICATE",
        attributeDefinitionId: ATTRIBUTE_ID,
        relatedAttributeDefinitionId: "other-id",
        currentValue: {
          attributeA: attributeSnapshot(),
          attributeB: { id: "other-id", code: "resistivity", name: "Resistivity" },
          rule: "LEXICAL_SIMILARITY",
        },
      }),
    );

    expect(labels.attribute).toBe("Resistance");
    expect(labels.relatedAttribute).toBe("Resistivity");
  });

  it('reads the pair by id even when the order is reversed', () => {
    const labels = findingSubjectLabels(
      finding({
        issueType: "POSSIBLE_DUPLICATE",
        attributeDefinitionId: "other-id",
        relatedAttributeDefinitionId: ATTRIBUTE_ID,
        currentValue: {
          attributeA: attributeSnapshot(),
          attributeB: { id: "other-id", code: "resistivity", name: "Resistivity" },
        },
      }),
    );

    expect(labels.attribute).toBe("Resistivity");
    expect(labels.relatedAttribute).toBe("Resistance");
  });

  it('falls back to the code, then to the id, rather than rendering nothing', () => {
    const byCode = findingSubjectLabels(
      finding({
        issueType: "UNUSED_ATTRIBUTE",
        attributeDefinitionId: ATTRIBUTE_ID,
        currentValue: { attribute: { id: ATTRIBUTE_ID, code: "resistance" } },
      }),
    );
    expect(byCode.attribute).toBe("resistance");

    // A finding persisted without any usable snapshot still identifies its subject.
    const byId = findingSubjectLabels(
      finding({
        issueType: "UNUSED_ATTRIBUTE",
        attributeDefinitionId: ATTRIBUTE_ID,
        currentValue: null,
      }),
    );
    expect(byId.attribute).toBe(ATTRIBUTE_ID);
  });

  it('reads the snapshot from metadata.expectedState when currentValue is absent', () => {
    // The two hold the same object by construction and the API's staleness check
    // falls back from one to the other, so a reader does too.
    const labels = findingSubjectLabels(
      finding({
        issueType: "UNUSED_ATTRIBUTE",
        attributeDefinitionId: ATTRIBUTE_ID,
        currentValue: null,
        metadata: {
          expectedState: { attribute: attributeSnapshot({ name: "Voltage Rating" }) },
        },
      }),
    );

    expect(labels.attribute).toBe("Voltage Rating");
  });

  it('reports an empty subject for a finding that names nothing', () => {
    const labels = findingSubjectLabels(
      finding({
        attributeDefinitionId: null,
        relatedAttributeDefinitionId: null,
        categoryId: null,
        currentValue: null,
        metadata: {},
      }),
    );

    expect(labels).toEqual({
      attribute: null,
      relatedAttribute: null,
      category: null,
    });
  });
});

describe("Attribute review queue — decision payload", () => {
  it('sends only lifecycle fields, so no mutation can be expressed', () => {
    const payload = buildAttributeDecisionPayload(
      finding(),
      "ACCEPTED",
      "Reviewed",
    );

    expect(payload).toEqual({
      decision: "ACCEPTED",
      expectedFingerprint: finding().fingerprint,
      decisionNotes: "Reviewed",
    });
    // No field, subject or value may travel with a decision.
    for (const forbidden of [
      "value",
      "field",
      "categoryId",
      "attributeDefinitionId",
      "apply",
      "finalValue",
    ]) {
      expect(forbidden in payload).toBe(false);
    }
  });

  it('omits blank notes and carries the fingerprint for revision proof', () => {
    const payload = buildAttributeDecisionPayload(finding(), "DISMISSED", "   ");
    expect(payload.decisionNotes).toBeUndefined();
    expect(payload.expectedFingerprint).toHaveLength(64);
  });
});

describe("Attribute review queue API client", () => {
  const source = readFileSync(
    join(__dirname, "api", "attribute-review-queue-api.ts"),
    "utf8",
  );

  it('targets the persisted review-queue routes', () => {
    expect(source).toContain('"/ml/attributes/review-queue"');
    expect(source).toContain("`${BASE_PATH}/${encodeURIComponent(id)}/decision`");
    expect(source).toContain("`${BASE_PATH}/audit`");
    expect(source).toContain("`${BASE_PATH}/mark-stale`");
    expect(source).toContain("`${BASE_PATH}/${encodeURIComponent(id)}/apply`");
  });

  it('exposes exactly one mutation, and only the review-queue apply route', () => {
    // Applying a finding is the queue's only write beyond the lifecycle decision.
    // It may not grow into a general attribute-library client: the legacy
    // bulk-apply endpoint must never be reachable from here.
    expect(source).toContain("applyFinding");
    expect(source).not.toContain("apply-bindings");
    expect(source).not.toContain("bindCategory");
    expect(source).not.toContain("createDefinition");
    expect(source).not.toContain("addOption");
    expect(source).not.toContain("unbindCategory");
  });

  it('clamps page size to the backend ceiling', () => {
    expect(source).toContain("MAX_ATTRIBUTE_QUEUE_PAGE_SIZE");
    expect(MAX_ATTRIBUTE_QUEUE_PAGE_SIZE).toBe(100);
    expect(DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE).toBe(20);
  });
});

describe("Attribute review queue dialog — data source", () => {
  const dialog = readFileSync(
    join(__dirname, "..", "components", "attributes", "attribute-review-queue-dialog.tsx"),
    "utf8",
  );

  it('reads the persisted queue and never the legacy recomputing endpoint', () => {
    expect(dialog).toContain("attributeReviewQueueApi.listFindings");
    expect(dialog).toContain("attributeReviewQueueApi.recordDecision");
    expect(dialog).toContain("attributeReviewQueueApi.runAudit");
    // The legacy client method and the mutation helpers it used are gone.
    expect(dialog).not.toContain("getReviewQueue");
    expect(dialog).not.toContain("auditLibrary");
    expect(dialog).not.toContain("applyBindings");
    expect(dialog).not.toContain("bindCategory");
    expect(dialog).not.toContain("unbindCategory");
    expect(dialog).not.toContain("createDefinition");
    expect(dialog).not.toContain("addOption");
    expect(dialog).not.toContain("recordFeedback");
  });

  it('uses stable persisted finding ids as React keys and decision targets', () => {
    expect(dialog).toContain("key={finding.id}");
    // Every decision is recorded against the persisted finding id.
    expect(dialog).toContain('recordDecision(finding, "ACCEPTED")');
    expect(dialog).toContain('recordDecision(finding, "REJECTED")');
    expect(dialog).toContain('recordDecision(finding, "DISMISSED")');
    // No generated audit ids anywhere.
    expect(dialog).not.toMatch(/`audit-\$\{/);
    expect(dialog).not.toContain('"audit-1"');
  });

  it('loads the queue without running the producer on ordinary open', () => {
    // The open effect calls only the read path; the audit is behind its own handler.
    const openEffect = dialog.slice(
      dialog.indexOf("if (isOpen) {"),
      dialog.indexOf("}, [isOpen, loadQueue]);"),
    );
    expect(openEffect).toContain("loadQueue()");
    expect(openEffect).not.toContain("runAudit");
  });

  it('applies filters and the sort server-side, and loads the list without paging', () => {
    expect(dialog).toContain("page: 1");
    expect(dialog).toContain("pageSize: MAX_ATTRIBUTE_QUEUE_PAGE_SIZE");
    expect(dialog).toContain('sortBy: "createdAt"');
    expect(dialog).toContain("tabIssueTypeFilter(tab)");
    expect(dialog).toContain("confidenceLevel:");

    // One request returns the whole filtered list, matching the Component queue:
    // there is no page state and no paging control to move it.
    expect(dialog).not.toContain("pageNumber");
    expect(dialog).not.toContain("totalPages");
  });

  it('renders server-provided counts rather than counting loaded rows', () => {
    expect(dialog).toContain("buildAttributeTabCounts(page?.counts ?? null)");
    expect(dialog).not.toMatch(/items\.filter\(.*\)\.length/);
  });

  it('identifies each finding by name, never by uuid', () => {
    // The card's subject row names the attribute and the category. Rendering the raw
    // ids — `{attributeSubjectId ?? "—"}` or `{finding.categoryId}` — would tell the
    // reviewer nothing, and the names are already persisted with the finding.
    expect(dialog).toContain("const subjectLabels = findingSubjectLabels(finding)");
    expect(dialog).toContain("subjectLabels.attribute");
    expect(dialog).toContain("subjectLabels.category");
    expect(dialog).toContain("subjectLabels.relatedAttribute");
    expect(dialog).not.toContain("attributeSubjectId ?? ");
    expect(dialog).not.toMatch(/\{finding\.categoryId\}/);
    expect(dialog).not.toMatch(/\{finding\.relatedAttributeDefinitionId\}/);
  });

  it('offers all three decisions and an action-specific apply control', () => {
    expect(dialog).toContain('"ACCEPTED"');
    expect(dialog).toContain('"REJECTED"');
    expect(dialog).toContain('"DISMISSED"');

    // Apply exists now, but only as a labelled binding action. A bare "Apply"
    // button would not tell the reviewer what it does, so it must not appear.
    expect(dialog).not.toMatch(/>\s*Apply\s*</);
    expect(dialog).toContain("attributeApplyLabel(applyAction)");
    expect(dialog).toContain("canApplyAttributeFinding(finding, permissions.canApply)");
  });

  it('gates every write control on the write permission', () => {
    expect(dialog).toContain("deriveAttributeReviewPermissions");
    expect(dialog).toContain("permissions.canAudit");
    expect(dialog).toContain("permissions.canDecide");
    expect(dialog).toContain("permissions.canApply");
    expect(dialog).toContain("permissions.isReadOnly");
    expect(dialog).toContain("attributeReviewReadOnlyNotice()");
  });

  it('conveys that a decision does not change attribute data', () => {
    // The dialog states it in the body copy and in the audit action's tooltip, and
    // the acceptance copy says it too — the three places a reviewer looks.
    expect(dialog).toContain("Decisions record a review outcome only");
    expect(dialog).toContain("no attribute data is modified");
    expect(dialog).toContain("attributeAcceptNotice()");
  });

  it('preserves the existing dialog structure and tabs', () => {
    expect(dialog).toContain("DialogShell");
    expect(dialog).toContain("ATTRIBUTE_QUEUE_TABS");
    expect(dialog).toContain("Reasoning Evidence");
    expect(dialog).toContain("Run Library Audit");
  });

  it('refreshes in place without a page reload', () => {
    expect(dialog).not.toContain("window.location");
    expect(dialog).not.toContain("location.reload");
    expect(dialog).not.toContain("setInterval");
  });

  it('renders the creation action through the same apply control', () => {
    // Pass 7 did not add a second control: the creation action flows through the
    // existing action-specific apply button, which is what keeps creation gated by
    // `canApplyAttributeFinding` and confirmed by `attributeApplyConfirmation`
    // exactly like the binding actions.
    expect(dialog).toContain("attributeApplyLabel(applyAction)");
    expect(dialog).toContain("attributeApplyActionTitle(applyAction)");
    expect(dialog).toContain("canApplyAttributeFinding(finding, permissions.canApply)");
    expect(dialog).toContain("attributeApplyConfirmation(");

    // The button's icon is action-specific, so a creation cannot be drawn with the
    // removal icon the old two-way ternary would have produced.
    expect(dialog).toContain("<AttributeApplyIcon action={applyAction} />");
    expect(dialog).toContain('if (action === "CREATE_DEFINITION")');
    expect(dialog).not.toContain('applyAction === "ADD_BINDING" ? (\n');
  });
});

describe("Attribute categories dialog — guarded apply", () => {
  const dialog = readFileSync(
    join(__dirname, "..", "components", "attributes", "attribute-categories-dialog.tsx"),
    "utf8",
  );

  it('hides the AI-suggestion apply actions from read-only users', () => {
    // The endpoint behind those actions (`/ml/attributes/apply-bindings`) is now
    // guarded, so the UI must not offer a control the API would refuse.
    expect(dialog).toContain("hasPermission(ATTRIBUTE_WRITE_PERMISSION)");

    const lines = dialog.split("\n");

    // The bulk action: the guard and the handler must be in the same element.
    const bulkGuardIndex = lines.findIndex((line) =>
      line.includes("disabled={applyingAllHigh || !canWrite}"),
    );
    expect(bulkGuardIndex).toBeGreaterThan(-1);
    expect(
      lines
        .slice(bulkGuardIndex, bulkGuardIndex + 20)
        .join("\n"),
    ).toContain("onClick={handleAcceptAllHighConfidence}");

    // The per-suggestion action shares the same gate.
    const singleGuardIndex = lines.findIndex(
      (line) => line.trim() === "disabled={!canWrite}",
    );
    expect(singleGuardIndex).toBeGreaterThan(-1);
    expect(
      lines.slice(singleGuardIndex, singleGuardIndex + 20).join("\n"),
    ).toContain("onClick={() => handleAcceptAiSuggestion(sug)}");

    // Both explain why they are unavailable.
    expect(dialog).toContain("requires the ${ATTRIBUTE_WRITE_PERMISSION} permission");
  });
});

describe("Attribute review queue — apply eligibility", () => {
  const bindable = (overrides: Partial<AttributeReviewFindingDto> = {}) =>
    finding({
      issueType: "MISSING_EXPECTED_ATTRIBUTE",
      attributeDefinitionId: "attr-1",
      categoryId: "cat-1",
      status: "ACCEPTED",
      ...overrides,
    });

  /**
   * The Pass 7 shape: an expectation the library has no attribute for.
   *
   * `attributeDefinitionId: null` with the producer's own `isExisting: false` is
   * exactly what the normalizer persists when resolution found nothing, and it is
   * the only state that may create a definition.
   */
  const creatable = (overrides: Partial<AttributeReviewFindingDto> = {}) =>
    finding({
      issueType: "MISSING_EXPECTED_ATTRIBUTE",
      issueCategory: "ATTRIBUTE_BINDING",
      attributeDefinitionId: null,
      categoryId: "cat-1",
      status: "ACCEPTED",
      title: 'Expect "Termination Style" for "Resistors"',
      currentValue: {
        category: { id: "cat-1", code: "RESISTORS", name: "Resistors", isActive: true },
        expectedAttributeCode: "termination",
        expectedAttributeName: "Termination Style",
        existingAttribute: null,
        attributeExists: false,
        rule: "DOMAIN_EXPECTATION",
      },
      suggestedValue: {
        rule: "DOMAIN_EXPECTATION",
        suggestedAction: "BIND_ATTRIBUTE",
        canonicalCode: "termination",
        canonicalName: "Termination Style",
        dataType: "SELECT",
        groupName: "Physical",
        isExisting: false,
        isRequired: false,
      },
      metadata: { attributeCode: "termination", categoryCode: "RESISTORS" },
      ...overrides,
    });

  it('maps only the two binding families onto an action', () => {
    expect(attributeApplyAction(bindable())).toBe("ADD_BINDING");
    expect(
      attributeApplyAction(
        finding({ issueType: "SUSPICIOUS_BINDING", categoryId: "cat-1" }),
      ),
    ).toBe("REMOVE_BINDING");

    // The other families have no implemented mutation, so they must resolve to no
    // action at all rather than to a default.
    for (const issueType of [
      "POSSIBLE_DUPLICATE",
      "DUPLICATE_ATTRIBUTE",
      "UNUSED_ATTRIBUTE",
      "SUGGESTED_BINDING",
      "SUGGESTED_ENUM_VALUE",
      "INCONSISTENT_CONFIG",
    ]) {
      expect(attributeApplyAction(finding({ issueType }))).toBeNull();
    }
  });

  it('offers Create Attribute only for an expectation with no definition', () => {
    expect(attributeApplyAction(creatable())).toBe("CREATE_DEFINITION");

    // The same family with a resolved definition stays a binding.
    expect(attributeApplyAction(bindable())).toBe("ADD_BINDING");

    // The audit's ambiguous case: the producer claimed the attribute exists, but
    // no definition could be resolved. Neither binding nor creating is right.
    expect(
      attributeApplyAction(
        creatable({
          suggestedValue: {
            canonicalCode: "termination",
            canonicalName: "Termination Style",
            dataType: "SELECT",
            isExisting: true,
          },
        }),
      ),
    ).toBeNull();

    // A Pass 1-era finding with no `isExisting` flag at all is refused, not guessed.
    expect(
      attributeApplyAction(
        creatable({ suggestedValue: { canonicalCode: "termination" } }),
      ),
    ).toBeNull();
    expect(attributeApplyAction(creatable({ suggestedValue: null }))).toBeNull();
  });

  it('labels creation as creating, never as a generic apply', () => {
    expect(attributeApplyLabel("CREATE_DEFINITION")).toBe("Create Attribute");
    expect(
      canApplyAttributeFinding(creatable(), true),
    ).toBe(true);
    // Read-only users can inspect the finding but cannot create.
    expect(canApplyAttributeFinding(creatable(), false)).toBe(false);
    expect(attributeApplyUnavailableReason(creatable(), false)).toContain(
      "Inventory.Update",
    );
    // Already applied, or not yet accepted, offers nothing.
    expect(
      canApplyAttributeFinding(creatable({ applicationResult: "APPLIED" }), true),
    ).toBe(false);
    expect(canApplyAttributeFinding(creatable({ status: "PENDING" }), true)).toBe(
      false,
    );
  });

  it('reads the proposal from the finding, with nothing defaulted', () => {
    const proposal = attributeDefinitionProposal(creatable());
    expect(proposal).toMatchObject({
      code: "termination",
      name: "Termination Style",
      dataType: "SELECT",
      unitCategory: null,
      defaultUnit: null,
      groupName: "Physical",
      optionLabels: [],
      complete: true,
      missing: [],
    });

    // Nothing is invented for display: an undeclared field is reported as missing,
    // because the server refuses such a proposal.
    const incomplete = attributeDefinitionProposal(
      creatable({
        suggestedValue: {
          canonicalCode: "termination",
          canonicalName: "Termination Style",
          isExisting: false,
        },
      }),
    );
    expect(incomplete.dataType).toBe("");
    expect(incomplete.complete).toBe(false);
    expect(incomplete.missing).toEqual(["data type"]);
  });

  it('falls back to the expected-state snapshot for the proposal', () => {
    const proposal = attributeDefinitionProposal(
      creatable({ suggestedValue: { isExisting: false } }),
    );
    expect(proposal.code).toBe("termination");
    expect(proposal.name).toBe("Termination Style");
    // The snapshot has no data type of its own, so the proposal is incomplete.
    expect(proposal.complete).toBe(false);
  });

  it('lists option labels from either accepted option shape', () => {
    const proposal = attributeDefinitionProposal(
      creatable({
        suggestedValue: {
          canonicalCode: "termination",
          canonicalName: "Termination Style",
          dataType: "SELECT",
          isExisting: false,
          options: ["SMD / SMT", { code: "TH", label: "Through Hole" }],
        },
      }),
    );
    expect(proposal.optionLabels).toEqual(["SMD / SMT", "Through Hole"]);
  });

  it('confirms creation with the definition it will create', () => {
    const confirmation = attributeApplyConfirmation({
      finding: creatable(),
      action: "CREATE_DEFINITION",
    });
    expect(confirmation.title).toMatch(/create this attribute definition/i);
    expect(confirmation.confirmLabel).toBe("Create Attribute");
    expect(confirmation.destructive).toBe(false);
    expect(confirmation.description).toMatch(/adds "Termination Style"/);

    const rows = Object.fromEntries(
      confirmation.subject.map((row) => [row.label, row.value]),
    );
    expect(rows).toMatchObject({
      Attribute: "Termination Style",
      Code: "termination",
      "Data type": "SELECT",
      Category: "Resistors",
      "Unit category": "None",
      "Default unit": "None",
      Group: "Physical",
    });
    // No options proposed: said plainly rather than shown as an empty cell.
    expect(rows.Options).toMatch(/add them after/i);
  });

  it('warns in the confirmation when the proposal cannot be created', () => {
    const confirmation = attributeApplyConfirmation({
      finding: creatable({
        suggestedValue: {
          canonicalCode: "termination",
          canonicalName: "Termination Style",
          isExisting: false,
        },
      }),
      action: "CREATE_DEFINITION",
    });
    expect(confirmation.description).toMatch(/does not declare its data type/i);
    expect(confirmation.description).toMatch(/refuse/i);
  });

  it('reports what a completed creation produced', () => {
    const message = attributeApplySuccessMessage({
      action: "CREATE_DEFINITION",
      attributeName: "Termination Style",
      categoryName: "Resistors",
      appliedState:
        "Created 'Termination Style' (termination) and bound it to 'Resistors'",
      createdDefinition: {
        code: "termination",
        name: "Termination Style",
        dataType: "SELECT",
        optionCount: 2,
      },
    });
    expect(message).toMatch(/Created "Termination Style" \(termination, SELECT\)/);
    expect(message).toMatch(/bound it to "Resistors"/);
    expect(message).toMatch(/2 options were created with it/);
    expect(message).toContain("Recorded state:");
  });

  it('offers apply only for an accepted, unapplied, writable finding', () => {
    expect(canApplyAttributeFinding(bindable(), true)).toBe(true);
    expect(canApplyAttributeFinding(bindable(), false)).toBe(false);
    expect(
      canApplyAttributeFinding(
        bindable({ applicationResult: "APPLIED" }),
        true,
      ),
    ).toBe(false);
    expect(
      canApplyAttributeFinding(finding({ issueType: "UNUSED_ATTRIBUTE", status: "ACCEPTED" }), true),
    ).toBe(false);
  });

  it('requires ACCEPTED: accepting and applying are separate acts', () => {
    // Every non-accepted status is refused, including PENDING — the reviewer must
    // approve first, so apply is never an implicit acceptance.
    for (const status of ["PENDING", "REJECTED", "DISMISSED", "STALE"] as const) {
      expect(canApplyAttributeFinding(bindable({ status }), true)).toBe(false);
    }
    expect(canApplyAttributeFinding(bindable({ status: "ACCEPTED" }), true)).toBe(
      true,
    );
  });

  it('labels each action with the mutation it performs', () => {
    expect(attributeApplyLabel("ADD_BINDING")).toBe("Add Binding");
    expect(attributeApplyLabel("REMOVE_BINDING")).toBe("Remove Binding");
    for (const label of Object.values(ATTRIBUTE_APPLY_LABELS)) {
      expect(label).not.toBe("Apply");
    }
  });

  it('detects application separately from review status', () => {
    expect(isAttributeFindingApplied(finding({ applicationResult: "APPLIED" }))).toBe(
      true,
    );
    expect(
      isAttributeFindingApplied(
        finding({ status: "ACCEPTED", applicationResult: "NOT_APPLIED" }),
      ),
    ).toBe(false);
  });

  it('explains every reason apply is unavailable', () => {
    expect(
      attributeApplyUnavailableReason(finding({ applicationResult: "APPLIED" }), true),
    ).toMatch(/already applied/i);
    expect(
      attributeApplyUnavailableReason(finding({ issueType: "UNUSED_ATTRIBUTE" }), true),
    ).toMatch(/review-only/i);
    expect(
      attributeApplyUnavailableReason(bindable(), false),
    ).toContain("Inventory.Update");
    expect(
      attributeApplyUnavailableReason(bindable({ status: "PENDING" }), true),
    ).toMatch(/accept this finding first/i);
    expect(
      attributeApplyUnavailableReason(bindable({ status: "STALE" }), true),
    ).toMatch(/stale/i);
    // The ambiguous expectation gets its own explanation, because "review-only"
    // would be wrong: the family is applicable, the subject is not resolvable.
    expect(
      attributeApplyUnavailableReason(
        creatable({
          suggestedValue: {
            canonicalCode: "termination",
            canonicalName: "Termination Style",
            isExisting: true,
          },
        }),
        true,
      ),
    ).toMatch(/could not resolve/i);

    // Offered: no reason to report.
    expect(attributeApplyUnavailableReason(bindable(), true)).toBeNull();
    expect(attributeApplyUnavailableReason(creatable(), true)).toBeNull();
  });

  it('never claims a decision mutates, but may claim apply does', () => {
    // The decision copy is unchanged: accepting still changes nothing. Only the
    // apply copy is allowed to describe a library change.
    expect(ATTRIBUTE_DECISION_COPY.ACCEPTED.summary).toMatch(/later step/i);
    const confirmation = attributeApplyConfirmation({
      finding: bindable(),
      action: "ADD_BINDING",
    });
    expect(confirmation.description).toMatch(/bind/i);
  });
});

describe("Attribute review queue — apply confirmation", () => {
  const expectation = () =>
    finding({
      issueType: "MISSING_EXPECTED_ATTRIBUTE",
      attributeDefinitionId: "attr-1",
      categoryId: "cat-1",
      title: 'Bind "Voltage Rating" to category "Electrical"',
      currentValue: {
        category: { id: "cat-1", code: "ELEC", name: "Electrical" },
        expectedAttributeCode: "voltage_rating",
        expectedAttributeName: "Voltage Rating",
        existingAttribute: null,
        attributeExists: false,
      },
      suggestedValue: { canonicalCode: "voltage_rating", canonicalName: "Voltage Rating" },
    });

  const suspicious = () =>
    finding({
      issueType: "SUSPICIOUS_BINDING",
      attributeDefinitionId: "attr-1",
      categoryId: "cat-1",
      title: 'Unbind suspicious "Voltage Rating" from "Electrical"',
      currentValue: {
        attribute: { id: "attr-1", code: "voltage_rating", name: "Voltage Rating" },
        category: { id: "cat-1", code: "ELEC", name: "Electrical" },
        bindingExists: true,
      },
    });

  it('names the attribute and the category from the finding’s own snapshot', () => {
    expect(attributeApplySubject(expectation())).toEqual({
      attributeName: "Voltage Rating",
      categoryName: "Electrical",
    });
    expect(attributeApplySubject(suspicious())).toEqual({
      attributeName: "Voltage Rating",
      categoryName: "Electrical",
    });
  });

  it('falls back to the ids rather than showing nothing', () => {
    const bare = finding({
      issueType: "SUSPICIOUS_BINDING",
      attributeDefinitionId: "attr-9",
      categoryId: "cat-9",
      currentValue: null,
      suggestedValue: null,
    });
    expect(attributeApplySubject(bare)).toEqual({
      attributeName: "attr-9",
      categoryName: "cat-9",
    });
  });

  it('states the consequence of adding a binding, non-destructively', () => {
    const confirmation = attributeApplyConfirmation({
      finding: expectation(),
      action: "ADD_BINDING",
    });

    expect(confirmation.title).toMatch(/add attribute binding/i);
    expect(confirmation.confirmLabel).toBe("Add Binding");
    expect(confirmation.destructive).toBe(false);
    expect(confirmation.description).toContain("Voltage Rating");
    expect(confirmation.description).toContain("Electrical");
    expect(confirmation.subject).toEqual([
      { label: "Attribute", value: "Voltage Rating" },
      { label: "Category", value: "Electrical" },
    ]);
    // It must not imply the scope is wider than a binding.
    expect(confirmation.description).not.toMatch(/creates? the attribute\b/i);
  });

  it('states the consequence of removing a binding, destructively', () => {
    const confirmation = attributeApplyConfirmation({
      finding: suspicious(),
      action: "REMOVE_BINDING",
    });

    expect(confirmation.title).toMatch(/remove attribute binding/i);
    expect(confirmation.confirmLabel).toBe("Remove Binding");
    expect(confirmation.destructive).toBe(true);
    expect(confirmation.description).toContain("Voltage Rating");
    expect(confirmation.description).toContain("Electrical");
    // The definition and the category survive; only the link goes.
    expect(confirmation.description).toMatch(/kept/i);
  });

  it('summarises a completed application with the states the backend reported', () => {
    const message = attributeApplySuccessMessage({
      action: "ADD_BINDING",
      attributeName: "Voltage Rating",
      categoryName: "Electrical",
      appliedState: "BOUND",
    });
    expect(message).toContain("Voltage Rating");
    expect(message).toContain("Electrical");
    expect(message).toContain("BOUND");

    expect(
      attributeApplySuccessMessage({
        action: "REMOVE_BINDING",
        attributeName: "Voltage Rating",
        categoryName: "Electrical",
        appliedState: "UNBOUND",
      }),
    ).toMatch(/no longer available/i);
  });

  it('describes applied state, and stays silent when not applied', () => {
    expect(
      attributeAppliedSummary(
        finding({ applicationResult: "NOT_APPLIED", status: "ACCEPTED" }),
      ),
    ).toBeNull();

    const summary = attributeAppliedSummary(
      finding({
        applicationResult: "APPLIED",
        status: "ACCEPTED",
        updatedAt: "2026-09-21T10:00:00.000Z",
        reviewerEmail: "reviewer@48studios.test",
      }),
    );
    expect(summary).toContain("Applied to the attribute library");
    expect(summary).toContain("reviewer@48studios.test");
  });

  it('moves "needs review" onto accepted after an apply, and leaves other filters alone', () => {
    // An applied finding is no longer awaiting review, so leaving the reviewer on
    // "needs review" would hide the row they just changed.
    expect(statusFilterAfterApply("PENDING")).toBe("ACCEPTED");
    expect(statusFilterAfterApply("PENDING,STALE")).toBe("ACCEPTED");
    for (const untouched of ["ALL", "ACCEPTED", "REJECTED", "DISMISSED", "STALE"]) {
      expect(statusFilterAfterApply(untouched)).toBe(untouched);
    }
  });
});

describe("Attribute review queue — apply payload", () => {
  it('sends the action and the revision proof only', () => {
    const payload = buildAttributeApplyPayload(finding(), "ADD_BINDING");

    expect(payload).toEqual({
      action: "ADD_BINDING",
      expectedFingerprint: finding().fingerprint,
    });
    expect(payload.expectedFingerprint).toHaveLength(64);

    // No subject or value may travel with an apply: the backend decides what each
    // supported family applies, so this route cannot be steered.
    for (const forbidden of [
      "categoryId",
      "attributeDefinitionId",
      "attributeCode",
      "sortOrder",
      "value",
      "field",
      "applicationResult",
      "status",
    ]) {
      expect(forbidden in payload).toBe(false);
    }
  });

  it('omits blank notes and keeps the action verbatim', () => {
    const payload = buildAttributeApplyPayload(
      finding(),
      "REMOVE_BINDING",
      "   ",
    );
    expect(payload.decisionNotes).toBeUndefined();
    expect(payload.action).toBe("REMOVE_BINDING");
  });
});

describe("Attribute review queue — apply conflict messaging", () => {
  it('passes the backend message through, which names the state that changed', () => {
    expect(
      attributeApplyConflictMessage(409, {
        message: "The binding no longer exists, so there is nothing to remove.",
        reason: "FINDING_STALE",
      }),
    ).toBe("The binding no longer exists, so there is nothing to remove.");
  });

  it('explains permission, missing and conflict outcomes in its own terms', () => {
    expect(attributeApplyConflictMessage(403, {})).toContain("Inventory.Update");
    expect(attributeApplyConflictMessage(404, {})).toMatch(/no longer exists/i);
    expect(attributeApplyConflictMessage(409, {})).toMatch(
      /library changed|refresh/i,
    );
    expect(attributeApplyConflictMessage(500, {})).toMatch(/could not be applied/i);
  });

  it('recognises every reason the backend can return', () => {
    for (const reason of ATTRIBUTE_APPLY_CONFLICT_REASONS) {
      expect(isAttributeApplyConflictReason(reason)).toBe(true);
    }
    expect(isAttributeApplyConflictReason("SOMETHING_ELSE")).toBe(false);
    expect(isAttributeApplyConflictReason(undefined)).toBe(false);
    // The two families the UI is allowed to offer are represented.
    expect(ATTRIBUTE_APPLY_CONFLICT_REASONS).toContain("ALREADY_APPLIED");
    expect(ATTRIBUTE_APPLY_CONFLICT_REASONS).toContain("FINDING_NOT_ACCEPTED");
  });
});

describe("Attribute review queue dialog — apply flow", () => {
  const dialog = readFileSync(
    join(__dirname, "..", "components", "attributes", "attribute-review-queue-dialog.tsx"),
    "utf8",
  );

  it('calls the apply route and re-reads the queue instead of patching it', () => {
    expect(dialog).toContain("attributeReviewQueueApi.applyFinding(");
    expect(dialog).toContain("buildAttributeApplyPayload(finding, action)");
    // The counts and the row come from the server after an apply.
    expect(dialog).toContain("await loadQueue();");
  });

  it('never reloads the page and never polls', () => {
    expect(dialog).not.toContain("window.location");
    expect(dialog).not.toContain("location.reload");
    expect(dialog).not.toContain("setInterval");
    expect(dialog).not.toContain("router.refresh");
  });

  it('requires a confirmation before mutating', () => {
    // The button only stages the intent; the mutation happens on confirm.
    expect(dialog).toContain("setPendingApply({ finding, action: applyAction })");
    expect(dialog).toContain("onClick={() => void confirmApply()}");
    expect(dialog).toContain("attributeApplyConfirmation({");
    // The confirmation names a real subject, not an abstract target.
    expect(dialog).toContain("applyConfirmation.subject.map");
    expect(dialog).toContain("No attribute definition,");
  });

  it('offers the action-specific label on both the trigger and the confirm button', () => {
    expect(dialog).toContain("{attributeApplyLabel(applyAction)}");
    expect(dialog).toContain("{applyConfirmation.confirmLabel}");
  });

  it('hides apply for review-only families and for read-only users', () => {
    // `showApplyButton` is false whenever the family resolves to no action, which
    // is the only way the button is rendered.
    expect(dialog).toContain("const showApplyButton =");
    expect(dialog).toContain("applyAction !== null &&");
    expect(dialog).toContain("canApplyAttributeFinding(finding, permissions.canApply)");

    // A read-only reviewer is told why, and the tree carries no apply affordance.
    expect(dialog).toContain("attributeApplyUnavailableReason(");
  });

  it('reports acceptance and application as separate facts', () => {
    expect(dialog).toContain("APPLIED");
    expect(dialog).toContain("REVIEW ONLY");
    expect(dialog).toContain("attributeAppliedSummary(finding)");
  });

  it('re-reads after a refusal so a dead action is not offered again', () => {
    expect(dialog).toContain("attributeApplyConflictMessage(statusCode, err)");
    const lines = dialog.split("\n");
    const conflictIndex = lines.findIndex((line) =>
      line.includes("if (statusCode === 409 || statusCode === 404)"),
    );
    expect(conflictIndex).toBeGreaterThan(-1);
    // There are two such guards: one for decisions, one for apply. Both refresh.
    expect(
      lines.filter((line) =>
        line.includes("if (statusCode === 409 || statusCode === 404)"),
      ),
    ).toHaveLength(2);
  });

  it('keeps Accept non-mutating: it never calls apply', () => {
    const lines = dialog.split("\n");
    const acceptIndex = lines.findIndex((line) =>
      line.includes('recordDecision(finding, "ACCEPTED")'),
    );
    expect(acceptIndex).toBeGreaterThan(-1);

    const decisionHandler = lines.slice(0, acceptIndex).join("\n");
    // The decision handler is the only caller of recordDecision, and it must not
    // have grown an apply call.
    const recordStart = decisionHandler.lastIndexOf("const recordDecision = async");
    const recordBody = lines
      .slice(recordStart, lines.findIndex((line) => line.includes("const confirmApply = async")))
      .join("\n");
    expect(recordBody).not.toContain("applyFinding");
    expect(recordBody).not.toContain("apply-bindings");
  });

  it('never routes apply through the legacy bulk endpoint', () => {
    expect(dialog).not.toContain("apply-bindings");
    // The dialog reaches apply only through the persisted review-queue client.
    expect(dialog).toContain("attributeReviewQueueApi.applyFinding(");
  });
});

describe("Attribute review queue — application state", () => {
  it('labels application state separately from review status', () => {
    expect(
      attributeApplicationLabel(finding({ applicationResult: "NOT_APPLIED" })),
    ).toBe("Not applied");
    expect(
      attributeApplicationLabel(finding({ applicationResult: "APPLIED" })),
    ).toBe("Applied");

    // An ACCEPTED + NOT_APPLIED finding is approved and waiting; the two labels must
    // not collapse into one another.
    const accepted = finding({
      status: "ACCEPTED",
      applicationResult: "NOT_APPLIED",
    });
    expect(attributeStatusLabel(accepted.status)).toBe("Accepted");
    expect(attributeApplicationLabel(accepted)).toBe("Not applied");
  });
});

describe("Attribute review queue dialog — application state", () => {
  const dialog = readFileSync(
    join(__dirname, "..", "components", "attributes", "attribute-review-queue-dialog.tsx"),
    "utf8",
  );

  it('keeps application state out of the queue filter controls', () => {
    // The worklist selector was removed, and its server-side filter went with it:
    // an invisible application-state filter would show fewer findings than the
    // controls on screen account for. The remaining filters are untouched.
    expect(dialog).not.toContain("ATTRIBUTE_WORKLISTS");
    expect(dialog).not.toContain("worklistFilter");
    expect(dialog).not.toContain("Ready to Apply");
    expect(dialog).toContain("attributeReviewQueueApi.listFindings({");
    expect(dialog).toContain("tabIssueTypeFilter(tab)");
    expect(dialog).toContain("confidenceLevel:");
  });

  it('shows acceptance and application as two separate facts per row', () => {
    expect(dialog).toContain("attributeApplicationLabel(finding)");
    expect(dialog).toContain("attributeAppliedSummary(finding)");
    expect(dialog).toContain("APPLIED");
    expect(dialog).toContain("REVIEW ONLY");
  });

  it('still hides Apply for review-only families and for read-only users', () => {
    // Pass 4's eligibility rule is unchanged: appearing in the list is not
    // permission to apply.
    expect(dialog).toContain("canApplyAttributeFinding(finding, permissions.canApply)");
    expect(dialog).toContain("attributeApplyAction(finding)");
    expect(dialog).toContain("attributeApplyUnavailableReason(");
  });

  it('keeps an applied finding visible after apply', () => {
    // Apply does not filter the list down to one application state: it moves the
    // status selector off "needs review", so an applied finding stays visible.
    const lines = dialog.split("\n");
    const handler = lines
      .slice(
        lines.findIndex((line) => line.includes("const confirmApply = async")),
        lines.findIndex((line) => line.includes("const applyConfirmation = React.useMemo")),
      )
      .join("\n");

    expect(handler).toContain("statusFilterAfterApply");
    // No reload, no polling, no router refresh — the queue is re-read.
    expect(handler).not.toContain("window.location");
    expect(handler).not.toContain("setInterval");
    expect(handler).toContain("await loadQueue()");
  });

  it('re-reads the queue so counts and state come from the server after an apply', () => {
    expect(dialog).toContain("await loadQueue()");
    expect(dialog).toContain("onActionComplete?.()");
  });
});
