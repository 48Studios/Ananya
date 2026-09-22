import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ALL_FILTER_VALUE,
  INTELLIGENCE_CONFIDENCE_FILTER_OPTIONS,
  INTELLIGENCE_CONFIDENCE_LEVELS,
  INTELLIGENCE_REVIEW_STATUSES,
  INTELLIGENCE_STATUS_FILTER_OPTIONS,
  INTELLIGENCE_STATUS_LABELS,
  filterValueToParam,
  isIntelligenceReviewStatus,
  matchesConfidenceFilter,
  matchesStatusFilter,
} from "./intelligence-review-filters";
import {
  ATTRIBUTE_CONFIDENCE_FILTER_OPTIONS,
  ATTRIBUTE_STATUS_FILTER_OPTIONS,
  ATTRIBUTE_STATUS_LABELS,
  attributeStatusLabel,
} from "./attribute-review-queue";
import {
  CONFIDENCE_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  STATUS_LABELS,
  statusLabel,
} from "./component-review-queue";

/**
 * The shared review-filter vocabulary.
 *
 * These tests exist because the three Intelligence Review surfaces used to spell
 * their own filter labels: `PENDING` read "Pending Review" in the Component queue
 * and "Needs review" in the Attribute queue, and the confidence options read
 * "High" on one surface and "High confidence" on another. A reviewer moving
 * between the queues was reading two names for one state.
 *
 * The consistency assertions below are the guard against that returning: they
 * compare the surfaces' own exported constants, so a surface that stops using the
 * shared vocabulary fails here rather than in a screenshot.
 */

describe("Intelligence review filter vocabulary", () => {
  it("labels every lifecycle status the same way everywhere", () => {
    expect(INTELLIGENCE_STATUS_LABELS).toEqual({
      PENDING: "Needs review",
      ACCEPTED: "Accepted",
      REJECTED: "Rejected",
      DISMISSED: "Dismissed",
      STALE: "Stale",
    });
  });

  it("offers the statuses in lifecycle order, plus the outstanding-work view", () => {
    expect(INTELLIGENCE_STATUS_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      ...INTELLIGENCE_REVIEW_STATUSES,
      "PENDING,STALE",
    ]);
    // Every individual option is labelled from the one label table.
    for (const status of INTELLIGENCE_REVIEW_STATUSES) {
      expect(
        INTELLIGENCE_STATUS_FILTER_OPTIONS.find((o) => o.value === status)
          ?.label,
      ).toBe(INTELLIGENCE_STATUS_LABELS[status]);
    }
  });

  it("labels confidence bands as bands, not bare levels", () => {
    expect(INTELLIGENCE_CONFIDENCE_LEVELS).toEqual(["HIGH", "MEDIUM", "LOW"]);
    expect(
      INTELLIGENCE_CONFIDENCE_FILTER_OPTIONS.map((o) => o.label),
    ).toEqual(["High confidence", "Medium confidence", "Low confidence"]);
  });

  it("recognises only the shared statuses", () => {
    expect(isIntelligenceReviewStatus("PENDING")).toBe(true);
    expect(isIntelligenceReviewStatus("STALE")).toBe(true);
    expect(isIntelligenceReviewStatus("PENDING,STALE")).toBe(false);
    expect(isIntelligenceReviewStatus("BOGUS")).toBe(false);
  });
});

describe("Intelligence review filter matching", () => {
  it("treats ALL and an empty value as no filter", () => {
    expect(filterValueToParam(ALL_FILTER_VALUE)).toBeUndefined();
    expect(filterValueToParam("")).toBeUndefined();
    expect(filterValueToParam(undefined)).toBeUndefined();
    expect(filterValueToParam("PENDING")).toBe("PENDING");
  });

  it("matches a single status and a comma-separated list", () => {
    expect(matchesStatusFilter("PENDING", ALL_FILTER_VALUE)).toBe(true);
    expect(matchesStatusFilter("PENDING", "PENDING")).toBe(true);
    expect(matchesStatusFilter("ACCEPTED", "PENDING")).toBe(false);
    expect(matchesStatusFilter("PENDING", "PENDING,STALE")).toBe(true);
    expect(matchesStatusFilter("STALE", "PENDING,STALE")).toBe(true);
    expect(matchesStatusFilter("ACCEPTED", "PENDING,STALE")).toBe(false);
    // A finding with no status at all is not a member of any status filter.
    expect(matchesStatusFilter(null, "PENDING")).toBe(false);
    expect(matchesStatusFilter(undefined, "PENDING")).toBe(false);
    expect(matchesStatusFilter(null, ALL_FILTER_VALUE)).toBe(true);
  });

  it("matches a confidence band exactly", () => {
    expect(matchesConfidenceFilter("HIGH", ALL_FILTER_VALUE)).toBe(true);
    expect(matchesConfidenceFilter("HIGH", "HIGH")).toBe(true);
    expect(matchesConfidenceFilter("MEDIUM", "HIGH")).toBe(false);
    expect(matchesConfidenceFilter(null, "HIGH")).toBe(false);
    expect(matchesConfidenceFilter(null, ALL_FILTER_VALUE)).toBe(true);
  });
});

describe("Intelligence review filter consistency across surfaces", () => {
  it("gives the Component and Attribute queues the same status options", () => {
    expect(STATUS_FILTER_OPTIONS).toEqual(ATTRIBUTE_STATUS_FILTER_OPTIONS);
    expect(STATUS_FILTER_OPTIONS).toEqual(
      INTELLIGENCE_STATUS_FILTER_OPTIONS,
    );
  });

  it("gives the Component and Attribute queues the same confidence options", () => {
    expect(CONFIDENCE_FILTER_OPTIONS).toEqual(
      ATTRIBUTE_CONFIDENCE_FILTER_OPTIONS,
    );
    expect(CONFIDENCE_FILTER_OPTIONS).toEqual(
      INTELLIGENCE_CONFIDENCE_FILTER_OPTIONS,
    );
  });

  it("resolves a status label identically on both queues", () => {
    for (const status of INTELLIGENCE_REVIEW_STATUSES) {
      expect(statusLabel(status), status).toBe(INTELLIGENCE_STATUS_LABELS[status]);
      expect(attributeStatusLabel(status), status).toBe(
        INTELLIGENCE_STATUS_LABELS[status],
      );
    }
    // The tables themselves are the shared one, not copies of it.
    expect(STATUS_LABELS).toEqual(INTELLIGENCE_STATUS_LABELS);
    expect(ATTRIBUTE_STATUS_LABELS).toEqual(INTELLIGENCE_STATUS_LABELS);
  });

  it("renders the same two selects on all three review surfaces", () => {
    const root = join(__dirname, "..");
    const dialogs = [
      join(root, "components", "components", "component-review-queue-dialog.tsx"),
      join(
        root,
        "components",
        "attributes",
        "attribute-review-queue-dialog.tsx",
      ),
      join(
        root,
        "components",
        "documentation",
        "component-specification-intelligence-dialog.tsx",
      ),
    ];

    for (const dialog of dialogs) {
      const source = readFileSync(dialog, "utf8");

      expect(source, dialog).toContain('aria-label="Status filter"');
      expect(source, dialog).toContain('aria-label="Confidence filter"');
      expect(source, dialog).toContain("All statuses");
      expect(source, dialog).toContain("All confidence");
      // The options come from the shared vocabulary rather than a local literal.
      expect(source, dialog).toMatch(
        /INTELLIGENCE_STATUS_FILTER_OPTIONS|ATTRIBUTE_STATUS_FILTER_OPTIONS|STATUS_FILTER_OPTIONS/,
      );
      expect(source, dialog).toMatch(
        /INTELLIGENCE_CONFIDENCE_FILTER_OPTIONS|ATTRIBUTE_CONFIDENCE_FILTER_OPTIONS|CONFIDENCE_FILTER_OPTIONS/,
      );
    }
  });

  it("does not re-declare a status label table inside a dialog", () => {
    const root = join(__dirname, "..");
    const dialogs = [
      join(root, "components", "components", "component-review-queue-dialog.tsx"),
      join(
        root,
        "components",
        "attributes",
        "attribute-review-queue-dialog.tsx",
      ),
      join(
        root,
        "components",
        "documentation",
        "component-specification-intelligence-dialog.tsx",
      ),
    ];

    for (const dialog of dialogs) {
      const source = readFileSync(dialog, "utf8");

      // "Needs review" belongs in the vocabulary, not in a dialog's own option
      // list; a local copy is how the two queues drifted apart before.
      expect(source, dialog).not.toContain('label: "Needs review"');
      expect(source, dialog).not.toContain('label: "Pending Review"');
    }
  });
});
