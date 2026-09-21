import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ATTRIBUTE_DECISION_COPY,
  ATTRIBUTE_ISSUE_TYPES_BY_TAB,
  ATTRIBUTE_QUEUE_TABS,
  ATTRIBUTE_READ_PERMISSION,
  ATTRIBUTE_STATUS_BADGES,
  ATTRIBUTE_STATUS_LABELS,
  ATTRIBUTE_WRITE_PERMISSION,
  attributeAcceptNotice,
  attributeAuditConflictMessage,
  attributeAuditUnavailableReason,
  attributeDecisionConflictMessage,
  attributeIssueTypeLabel,
  attributeReviewReadOnlyNotice,
  attributeStatusBadge,
  attributeStatusLabel,
  buildAttributeTabCounts,
  canDecideAttributeFinding,
  confidenceBadgeStatus,
  deriveAttributeReviewPermissions,
  findingHeadline,
  findingMatchesTab,
  isExpectationForUndefinedAttribute,
  producerIssueTypeLabel,
  producerUsageEvidence,
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

  it('grants decide and audit together, and marks read-only otherwise', () => {
    const writer = deriveAttributeReviewPermissions(true);
    expect(writer.canDecide).toBe(true);
    expect(writer.canAudit).toBe(true);
    expect(writer.isReadOnly).toBe(false);

    const reader = deriveAttributeReviewPermissions(false);
    expect(reader.canDecide).toBe(false);
    expect(reader.canAudit).toBe(false);
    expect(reader.isReadOnly).toBe(true);
  });

  it('never offers an Apply capability (this pass has none)', () => {
    const permissions = deriveAttributeReviewPermissions(true);
    expect(Object.keys(permissions)).toEqual([
      "canDecide",
      "canAudit",
      "isReadOnly",
    ]);
    expect("canApply" in permissions).toBe(false);
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
  });

  it('has no apply route and no attribute mutation helper', () => {
    expect(source).not.toMatch(/\/apply/);
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

  it('applies filters, sort and pagination server-side', () => {
    expect(dialog).toContain("page: pageNumber");
    expect(dialog).toContain("pageSize: DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE");
    expect(dialog).toContain("sortBy: \"createdAt\"");
    expect(dialog).toContain("tabIssueTypeFilter(tab)");
    expect(dialog).toContain("confidenceLevel:");
  });

  it('renders server-provided counts rather than counting loaded rows', () => {
    expect(dialog).toContain("buildAttributeTabCounts(page?.counts ?? null)");
    expect(dialog).not.toMatch(/items\.filter\(.*\)\.length/);
  });

  it('offers all three decisions and no apply control', () => {
    expect(dialog).toContain('"ACCEPTED"');
    expect(dialog).toContain('"REJECTED"');
    expect(dialog).toContain('"DISMISSED"');
    expect(dialog).not.toContain("Apply");
    expect(dialog).not.toMatch(/canApply/);
  });

  it('gates every write control on the write permission', () => {
    expect(dialog).toContain("deriveAttributeReviewPermissions");
    expect(dialog).toContain("permissions.canAudit");
    expect(dialog).toContain("permissions.canDecide");
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
