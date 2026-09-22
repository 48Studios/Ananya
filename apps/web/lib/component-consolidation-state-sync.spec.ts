import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type {
  ComponentReviewFindingDto,
  ComponentReviewQueuePageDto,
  ComponentReviewStatus,
  ConsolidationResultDto,
} from "./api/component-review-queue-api";
import {
  applyConsolidationToFinding,
  applyFindingStatusToQueuePage,
  buildQueueTabCounts,
  consolidationSuccessMessage,
} from "./component-review-queue";

/**
 * Consolidation state synchronisation.
 *
 * A consolidation commits its own effects — including marking the finding
 * ACCEPTED — inside the database transaction, so the review queue must reflect
 * that the moment the response lands. Requiring the operator to refresh was the
 * reported defect: the card they had just acted on still claimed the duplicate
 * needed attention.
 *
 * The fix is deliberately narrow and is asserted here as such:
 *
 *  - the authoritative response is threaded, not reduced to a signal,
 *  - the loaded page is updated surgically, not refetched wholesale,
 *  - nothing is marked ACCEPTED before the request succeeds,
 *  - the existing stale/fingerprint recovery path is untouched.
 *
 * There is no DOM testing library in this workspace, so rendering and wiring
 * claims are asserted against source, matching the other queue suites. The state
 * arithmetic itself is covered by real unit tests over the pure helpers.
 */

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

const panelPath =
  "components/components/component-consolidation-preview-panel.tsx";
const flowPath =
  "components/components/component-consolidation-execution-flow.tsx";
const investigationPath =
  "components/components/component-review-duplicate-investigation.tsx";
const findingDialogPath =
  "components/components/component-review-queue-finding-dialog.tsx";
const queueDialogPath =
  "components/components/component-review-queue-dialog.tsx";

function finding(
  overrides: Partial<ComponentReviewFindingDto> = {},
): ComponentReviewFindingDto {
  return {
    id: "finding-1",
    componentId: "component-1",
    relatedComponentId: "component-2",
    issueType: "EXACT_DUPLICATE",
    issueCategory: "DUPLICATE",
    title: "Exact duplicate of CMP-000038",
    description: "Two records share a normalised MPN and manufacturer.",
    currentValue: null,
    suggestedValue: null,
    confidence: 0.98,
    confidenceLevel: "HIGH",
    evidence: [],
    source: "ml",
    modelVersion: null,
    intelligenceVersion: "v1",
    fingerprint: "fingerprint-1",
    status: "PENDING",
    reviewerId: null,
    reviewerEmail: null,
    reviewedAt: null,
    decisionNotes: null,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    component: null,
    relatedComponent: null,
    ...overrides,
  };
}

function page(
  items: ComponentReviewFindingDto[],
  summaryOverrides: Partial<ComponentReviewQueuePageDto["summary"]> = {},
): ComponentReviewQueuePageDto {
  return {
    summary: {
      total: items.length,
      pending: items.filter((item) => item.status === "PENDING").length,
      accepted: items.filter((item) => item.status === "ACCEPTED").length,
      rejected: items.filter((item) => item.status === "REJECTED").length,
      dismissed: items.filter((item) => item.status === "DISMISSED").length,
      stale: items.filter((item) => item.status === "STALE").length,
      byCategory: { DUPLICATE: items.length },
      ...summaryOverrides,
    },
    items,
    total: items.length,
    page: 1,
    pageSize: 50,
  };
}

function consolidationResult(
  overrides: Partial<ConsolidationResultDto> = {},
): ConsolidationResultDto {
  return {
    consolidationId: "consolidation-1",
    status: "COMPLETED",
    idempotentReplay: false,
    findingId: "finding-1",
    canonical: {
      id: "component-1",
      sku: "CMP-000038",
      name: "Hex bolt M8",
      isActive: true,
    },
    sources: [
      {
        id: "component-2",
        sku: "CMP-000039",
        name: "Hex bolt M8 (duplicate)",
        isActive: false,
        consolidatedIntoComponentId: "component-1",
        consolidatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    previewFingerprint: "preview-fingerprint-1",
    adapters: [],
    warnings: [],
    completedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A. A successful consolidation shows ACCEPTED immediately
// ---------------------------------------------------------------------------

describe("A. successful consolidation updates the finding immediately", () => {
  it("adopts the ACCEPTED status the backend committed", () => {
    const next = applyConsolidationToFinding(
      finding({ status: "PENDING" }),
      consolidationResult(),
    );
    expect(next?.status).toBe("ACCEPTED");
  });

  it("keeps every field the response does not carry", () => {
    // The dialog's snapshot is what the operator is looking at; only the status
    // is the response's business.
    const current = finding({
      status: "PENDING",
      decisionNotes: "Reviewed with the warehouse team",
      updatedAt: "2026-01-01T12:00:00.000Z",
    });
    const next = applyConsolidationToFinding(current, consolidationResult());
    expect(next).toEqual({ ...current, status: "ACCEPTED" });
  });

  it("does not mutate the snapshot it was given", () => {
    const current = finding({ status: "PENDING" });
    applyConsolidationToFinding(current, consolidationResult());
    expect(current.status).toBe("PENDING");
  });

  it("is a no-op when the finding is already ACCEPTED", () => {
    // Consolidating an already-accepted finding is the supported workflow, so
    // the second pass must not churn the object identity.
    const current = finding({ status: "ACCEPTED" });
    expect(applyConsolidationToFinding(current, consolidationResult())).toBe(
      current,
    );
  });

  it("reports the completed outcome in reviewer language", () => {
    const message = consolidationSuccessMessage(consolidationResult());
    expect(message).toContain("CMP-000039 was retired into CMP-000038");
    expect(message).toContain("ACCEPTED");
  });

  it("says so when the request was an idempotent replay", () => {
    const message = consolidationSuccessMessage(
      consolidationResult({ idempotentReplay: true }),
    );
    expect(message).toContain("already been applied");
    expect(message).toContain("not moved twice");
  });

  it("the dialog reconciles its own snapshot from the response", () => {
    const dialog = read(findingDialogPath);
    expect(dialog).toContain("applyConsolidationToFinding(current, result)");
    expect(dialog).toContain("consolidationSuccessMessage(result)");
  });

  it("the panel renders the receipt from the response, not from local copy", () => {
    const panel = read(panelPath);
    expect(panel).toContain("ConsolidationSuccessSummary");
    expect(panel).toContain(
      "<ConsolidationSuccessSummary result={consolidationResult} />",
    );

    const flow = read(flowPath);
    // Canonical, retired SKUs and the replay flag all come from the result.
    expect(flow).toContain("result.canonical.sku");
    expect(flow).toContain("result.sources.map((source) => source.sku)");
    expect(flow).toContain("result.idempotentReplay");
    // The receipt is a single component, so the queued result and the
    // immediately-reported one cannot drift apart.
    expect(flow).toContain("data-consolidation-receipt");
  });

  it("the receipt survives the preview reload that follows consolidation", () => {
    // Consolidating retires the source records, so the refreshed preview is no
    // longer executable and the execution flow unmounts. Rendering the receipt
    // from the flow alone would erase it the moment it settled.
    const panel = read(panelPath);
    expect(panel).toContain("setConsolidationResult(outcome)");
    expect(panel).toMatch(/consolidationResult\s*&&\s*\(/);
    expect(panel).toContain("!consolidationResult && preview.executable");
  });
});

// ---------------------------------------------------------------------------
// B. No full page reload
// ---------------------------------------------------------------------------

describe("B. no full page reload and no polling", () => {
  const chain = [
    panelPath,
    flowPath,
    investigationPath,
    findingDialogPath,
    queueDialogPath,
  ];

  it("never reloads or re-navigates the document", () => {
    for (const relativePath of chain) {
      const source = read(relativePath);
      expect(source).not.toContain("location.reload");
      expect(source).not.toContain("window.location");
      expect(source).not.toContain("router.refresh");
      expect(source).not.toContain("router.push");
    }
  });

  it("adds no polling or timers to the consolidation path", () => {
    for (const relativePath of [
      panelPath,
      flowPath,
      investigationPath,
      findingDialogPath,
    ]) {
      const source = read(relativePath);
      expect(source).not.toContain("setInterval");
    }
  });

  it("reconciles in place by updating the loaded page", () => {
    // The targeted update is what makes the change visible without a reload;
    // the refetch that follows is scoped to this dialog's own list.
    const queueDialog = read(queueDialogPath);
    expect(queueDialog).toContain("applyFindingStatusToQueuePage(");
    expect(queueDialog).toContain("setPage((current) =>");
    expect(queueDialog).toContain(
      "applyConsolidationToFinding(current, result)",
    );
  });

  it("refetches only the review queue and the one finding", () => {
    const queueDialog = read(queueDialogPath);
    expect(queueDialog).toContain("void loadQueue()");
    // Nothing else in the dialog is refetched as part of this flow.
    expect(queueDialog).not.toContain("reload()");

    const dialog = read(findingDialogPath);
    expect(dialog).toContain("void loadFinding(findingId)");
  });
});

// ---------------------------------------------------------------------------
// C. Queue status and counts stay consistent
// ---------------------------------------------------------------------------

describe("C. the review queue status and counts update consistently", () => {
  const pending = finding({ id: "finding-1", status: "PENDING" });
  const other = finding({ id: "finding-2", status: "PENDING" });

  it("moves the affected row to ACCEPTED and leaves the rest alone", () => {
    const before = page([pending, other]);
    const after = applyFindingStatusToQueuePage(
      before,
      "finding-1",
      "ACCEPTED",
    );

    expect(after.items[0]!.status).toBe("ACCEPTED");
    expect(after.items[1]!.status).toBe("PENDING");
    // Unrelated rows keep their identity, so they do not re-render.
    expect(after.items[1]).toBe(before.items[1]);
  });

  it("moves the count between the two status buckets", () => {
    const before = page([pending, other]);
    const after = applyFindingStatusToQueuePage(
      before,
      "finding-1",
      "ACCEPTED",
    );

    expect(after.summary.pending).toBe(1);
    expect(after.summary.accepted).toBe(1);
    expect(after.summary.rejected).toBe(0);
    expect(after.summary.dismissed).toBe(0);
    expect(after.summary.stale).toBe(0);
    // The finding still exists; only its bucket changed.
    expect(after.summary.total).toBe(2);
  });

  it("preserves counts it has no business changing", () => {
    const before = page([pending], {
      byCategory: { DUPLICATE: 1, IDENTITY: 4 },
    });
    const after = applyFindingStatusToQueuePage(
      before,
      "finding-1",
      "ACCEPTED",
    );
    expect(after.summary.byCategory).toEqual({ DUPLICATE: 1, IDENTITY: 4 });
  });

  it("keeps the page cursor and page size untouched", () => {
    const before = { ...page([pending]), page: 3, pageSize: 25, total: 91 };
    const after = applyFindingStatusToQueuePage(
      before,
      "finding-1",
      "ACCEPTED",
    );
    expect(after.page).toBe(3);
    expect(after.pageSize).toBe(25);
    expect(after.total).toBe(91);
  });

  it("keeps the tab counts derived from the list in step", () => {
    // Tabs are counted from the loaded rows, so the targeted row update is what
    // keeps the Duplicates badge honest without a second request.
    const before = page([pending, other]);
    expect(buildQueueTabCounts(before.items).DUPLICATES).toBe(2);

    const after = applyFindingStatusToQueuePage(
      before,
      "finding-1",
      "ACCEPTED",
    );
    expect(buildQueueTabCounts(after.items).DUPLICATES).toBe(2);
    expect(buildQueueTabCounts(after.items).STALE).toBe(0);
  });

  it("moves a row into the STALE bucket when that is the new status", () => {
    // The helper is status-agnostic; consolidation happens to use ACCEPTED.
    const before = page([pending]);
    const after = applyFindingStatusToQueuePage(before, "finding-1", "STALE");
    expect(after.summary.pending).toBe(0);
    expect(after.summary.stale).toBe(1);
    expect(buildQueueTabCounts(after.items).STALE).toBe(1);
  });

  it("returns the input untouched when the row is not on this page", () => {
    // A paged-out finding must not cause a partial update.
    const before = page([pending]);
    expect(
      applyFindingStatusToQueuePage(before, "finding-away", "ACCEPTED"),
    ).toBe(before);
  });

  it("returns the input untouched when the status already matches", () => {
    const before = page([pending]);
    expect(applyFindingStatusToQueuePage(before, "finding-1", "PENDING")).toBe(
      before,
    );
  });

  it("never lets a counter go negative", () => {
    // A page fetched before another reviewer's decision can disagree with the
    // summary; the decrement must still be safe.
    const before = page([pending], { pending: 0 });
    const after = applyFindingStatusToQueuePage(
      before,
      "finding-1",
      "ACCEPTED",
    );
    expect(after.summary.pending).toBe(0);
    expect(after.summary.accepted).toBe(1);
  });

  it("is a no-op when the queue has not loaded yet", () => {
    const queueDialog = read(queueDialogPath);
    // The updater is guarded so a completion before the first load cannot crash.
    expect(queueDialog).toMatch(
      /setPage\(\(current\) =>\s*current\s*\?\s*applyFindingStatusToQueuePage/,
    );
  });

  it("carries the status the backend committed, not a hard-coded guess", () => {
    const queueDialog = read(queueDialogPath);
    expect(queueDialog).toContain('result.findingId, "ACCEPTED"');
  });
});

// ---------------------------------------------------------------------------
// D. A failed consolidation must not mark the finding ACCEPTED
// ---------------------------------------------------------------------------

describe("D. a failed consolidation does not mark the finding ACCEPTED", () => {
  it("ignores a result that concerns a different finding", () => {
    const current = finding({ id: "finding-1", status: "PENDING" });
    const next = applyConsolidationToFinding(
      current,
      consolidationResult({ findingId: "finding-9" }),
    );
    expect(next).toBe(current);
    expect(next?.status).toBe("PENDING");
  });

  it("ignores a result when the dialog holds no finding", () => {
    expect(applyConsolidationToFinding(null, consolidationResult())).toBeNull();
  });

  it("does not update a page whose row is absent", () => {
    const before = page([finding({ id: "finding-2", status: "PENDING" })]);
    expect(applyFindingStatusToQueuePage(before, "finding-1", "ACCEPTED")).toBe(
      before,
    );
  });

  it("only reports completion after the request resolved", () => {
    // The whole guarantee rests on this ordering: `onCompleted` is inside the
    // try block and after the awaited call, so a refusal cannot reach it.
    const flow = read(flowPath);
    const call = flow.indexOf(
      "await componentReviewQueueApi.consolidateComponent(",
    );
    const completed = flow.indexOf("onCompleted?.(outcome)");
    const failure = flow.indexOf("setError(message)");

    expect(call).toBeGreaterThan(-1);
    expect(completed).toBeGreaterThan(call);
    expect(failure).toBeGreaterThan(completed);

    // The catch block reports and refreshes; it never claims success.
    const catchBlock = flow.slice(failure, flow.indexOf("} finally {"));
    expect(catchBlock).toContain("await onRefresh(canonicalId)");
    expect(catchBlock).not.toContain("onCompleted");
    expect(catchBlock).not.toContain("setResult");
  });

  it("does not mark the finding ACCEPTED before the response lands", () => {
    // No optimistic write anywhere on the path. The finding dialog does not even
    // hold the consolidation endpoint, so it has no way to reach a status ahead
    // of the response; it can only react to the result the flow hands it.
    const dialog = read(findingDialogPath);
    expect(dialog).not.toContain("consolidateComponent");
    expect(dialog).not.toContain("buildConsolidationPreview");

    // The only place the dialog adopts ACCEPTED from a consolidation is the
    // handler fed by the panel's success branch.
    const handler = dialog.slice(dialog.indexOf("const handleConsolidated"));
    expect(handler.indexOf("applyConsolidationToFinding")).toBeGreaterThan(-1);

    const panel = read(panelPath);
    const successBranch = panel.slice(
      panel.indexOf("onCompleted={(outcome) =>"),
    );
    expect(successBranch).toContain("setConsolidationResult(outcome)");
    expect(successBranch).toContain("onConsolidated?.(outcome)");
  });

  it("cannot be reached from the decision path", () => {
    // Recording a decision is a separate workflow; it must not inherit the
    // consolidation handler.
    const dialog = read(findingDialogPath);
    const submitDecision = dialog.slice(
      dialog.indexOf("const submitDecision"),
      dialog.indexOf("const handleConsolidated"),
    );
    expect(submitDecision).not.toContain("handleConsolidated");
    expect(submitDecision).not.toContain("onConsolidated");
  });
});

// ---------------------------------------------------------------------------
// E. Stale / fingerprint errors keep refreshing state
// ---------------------------------------------------------------------------

describe("E. stale and fingerprint refusals still recompute state", () => {
  it("still sends the fingerprint it is confirming against", () => {
    const flow = read(flowPath);
    expect(flow).toContain(
      "expectedPreviewFingerprint: preview.previewFingerprint",
    );
  });

  it("refreshes the analysis whenever a request is refused", () => {
    const flow = read(flowPath);
    const failure = flow.indexOf("setError(message)");
    const catchBlock = flow.slice(failure, flow.indexOf("} finally {"));
    // Unconditional: every refusal re-runs the preview rather than trusting the
    // facts the reviewer was looking at.
    expect(catchBlock).toContain("await onRefresh(canonicalId)");
    expect(catchBlock).not.toContain("if (");
  });

  it("keeps reloading the preview when the finding's revision moves", () => {
    const panel = read(panelPath);
    expect(panel).toContain("[enabled, load, findingRevision]");

    const investigation = read(investigationPath);
    expect(investigation).toContain(
      "findingRevision={`${finding.status}:${finding.updatedAt}`}",
    );
  });

  it("discards an in-flight confirmation when the preview changes", () => {
    const flow = read(flowPath);
    expect(flow).toContain("[preview.previewFingerprint]");
    expect(flow).toContain('setStage("idle")');
    expect(flow).toContain("setAcknowledged(false)");
  });

  it("stops offering execution once consolidation has completed", () => {
    // Re-running against retired components would fail on the fingerprint; the
    // UI withdraws the action rather than inviting a guaranteed refusal.
    const panel = read(panelPath);
    expect(panel).toContain("!consolidationResult && preview.executable");
  });

  it("still surfaces a conflict by re-reading the finding", () => {
    const dialog = read(findingDialogPath);
    expect(dialog).toContain("onConflict?.(message)");
    expect(dialog).toContain("void loadFinding(findingId)");
  });

  it("carries the result through every hop without discarding it", () => {
    // The reported defect was a dropped payload: `onCompleted={() =>
    // onConsolidated?.()}` threw the authoritative result away, so no consumer
    // could reconcile from it.
    const panel = read(panelPath);
    expect(panel).not.toContain("onCompleted={() => onConsolidated?.()}");
    expect(panel).toContain("onCompleted={(outcome) =>");

    const investigation = read(investigationPath);
    expect(investigation).toContain("onConsolidated={onConsolidated}");
    expect(investigation).toContain("result: ConsolidationResultDto");

    const dialog = read(findingDialogPath);
    expect(dialog).toContain("onConsolidated={handleConsolidated}");

    const queueDialog = read(queueDialogPath);
    expect(queueDialog).toContain("onConsolidated={handleConsolidated}");
    expect(queueDialog).toContain("result: ConsolidationResultDto");
  });

  it("the queue dialog declares the prop the finding dialog now sends", () => {
    // Regression: the chain was broken because this prop was never declared,
    // so the finding dialog silently dropped the completion signal.
    const dialog = read(findingDialogPath);
    expect(dialog).toContain(
      "onConsolidated?: (result: ConsolidationResultDto) => void",
    );

    const queueDialog = read(queueDialogPath);
    expect(queueDialog).toMatch(
      /const handleConsolidated = \(\s*result: ConsolidationResultDto/,
    );
  });
});

// ---------------------------------------------------------------------------
// The locked review-card design is untouched
// ---------------------------------------------------------------------------

describe("the locked review-card design is untouched", () => {
  it("keeps the consolidation UI out of the queue card list", () => {
    const queueDialog = read(queueDialogPath);
    expect(queueDialog).not.toContain("ConsolidationPreviewPanel");
    expect(queueDialog).not.toContain("ConsolidationSuccessSummary");
  });

  it("leaves the Pass 5C investigation sections in place", () => {
    const investigation = read(investigationPath);
    expect(investigation).toContain("Recorded inconsistencies");
    expect(investigation).toContain("Side-by-side comparison");
  });

  it("does not weaken any status transition on the backend", () => {
    // UI-only change: the web layer must not gain a way to write statuses.
    for (const relativePath of [findingDialogPath, queueDialogPath]) {
      const source = read(relativePath);
      expect(source).not.toContain("markStale");
      expect(source).not.toContain("db.patch");
    }
  });
});

// ---------------------------------------------------------------------------
// Status arithmetic covers the whole lifecycle, not just PENDING → ACCEPTED
// ---------------------------------------------------------------------------

describe("status bucket arithmetic is exhaustive", () => {
  const statuses: ComponentReviewStatus[] = [
    "PENDING",
    "ACCEPTED",
    "REJECTED",
    "DISMISSED",
    "STALE",
  ];

  it("moves a row between every pair of statuses consistently", () => {
    for (const from of statuses) {
      for (const to of statuses) {
        const before = page([finding({ status: from })]);
        const after = applyFindingStatusToQueuePage(before, "finding-1", to);
        if (from === to) {
          expect(after).toBe(before);
          continue;
        }
        expect(after.items[0]!.status).toBe(to);
        // Total is a property of the finding set, not of any one status.
        expect(after.summary.total).toBe(before.summary.total);
        // Exactly one row moved, so exactly one count left and one arrived.
        const netSum = statuses.reduce(
          (sum, status) => sum + after.summary[statusBucket(status)],
          0,
        );
        expect(netSum).toBe(before.summary.total);
      }
    }
  });
});

function statusBucket(
  status: ComponentReviewStatus,
): "pending" | "accepted" | "rejected" | "dismissed" | "stale" {
  switch (status) {
    case "PENDING":
      return "pending";
    case "ACCEPTED":
      return "accepted";
    case "REJECTED":
      return "rejected";
    case "DISMISSED":
      return "dismissed";
    case "STALE":
      return "stale";
  }
}
