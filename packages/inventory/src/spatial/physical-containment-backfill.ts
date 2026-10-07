import {
  canBePhysicalContainer,
  classifyLocationHierarchyRelationship,
  normalizeLocationCategory,
  type LocationHierarchyRelationshipKind,
  type SpatialLocationCategory,
} from "./location-model";

/**
 * RFC-0069 Phase 3A — read-only backfill PREVIEW (pure planning logic).
 *
 * Given the current `locations` rows, this computes the `containerId` value each
 * row WOULD receive if the Phase 3 backfill ran — without writing anything.
 *
 * The database I/O and the read-only harness live in
 * `tools/spatial-integrity/preview-physical-container-backfill.mjs`; this module
 * is the deterministic, side-effect-free core so it can be unit tested with plain
 * data.
 *
 * ## Proposal rules (RFC-0069 §16 Phase 3)
 *
 *   canonical         → containerId = parentId
 *   context-root      → containerId = parentId
 *   legacy-compatible → containerId = parentId   (preserves legacy tray → bin)
 *   violation         → containerId = NULL       (never guess)
 *   parentId = NULL   → containerId = NULL       (never infer facility ownership)
 *
 * A proposal is only emitted when the parent/child category pair independently
 * satisfies `canBePhysicalContainer`. `classifyLocationHierarchyRelationship`
 * labels any relationship whose parent is a context root as `context-root`, but
 * a context root may only own a context root or a physical ROOT category; when
 * the child fails that test the plan is UNSAFE and the caller must fail rather
 * than guess.
 */

export interface BackfillLocationInput {
  readonly id: string;
  readonly code: string;
  readonly kind: string;
  readonly parentId: string | null;
  readonly containerId: string | null;
  readonly isActive: boolean;
}

export interface BackfillProposal {
  childId: string;
  childCode: string;
  childKind: string;
  parentId: string;
  parentCode: string;
  parentKind: string;
  classification: LocationHierarchyRelationshipKind;
  proposedContainerId: string | null;
  proposedContainerCategory: SpatialLocationCategory | null;
  reason: string;
}

export type BackfillValidationCode =
  | "PARENT_MISSING"
  | "PREDICATE_FAILED"
  | "SELF_CONTAINER"
  | "INACTIVE_CONTAINER"
  | "CONTAINER_CYCLE"
  | "VIOLATION_PROPOSED";

export interface BackfillValidationIssue {
  code: BackfillValidationCode;
  childId: string;
  childCode: string;
  message: string;
}

export interface BackfillSummary {
  locationsScanned: number;
  relationshipsScanned: number;
  alreadyPopulated: number;
  unparented: number;
  canonical: { count: number; proposed: number };
  contextRoot: { count: number; proposed: number };
  legacyCompatible: { count: number; proposed: number };
  violations: {
    count: number;
    proposedNull: number;
    breakdown: Array<{ pair: string; count: number }>;
  };
  /** Relationships that WOULD receive a non-null containerId. */
  proposedAssignments: number;
  /** Relationships classified as violations (proposed NULL). */
  proposedNull: number;
  /** Rows that remain NULL: unparented + violations. */
  unchangedNull: number;
}

export interface BackfillPlan {
  proposals: BackfillProposal[];
  summary: BackfillSummary;
  validation: { safe: boolean; issues: BackfillValidationIssue[] };
}

/**
 * The exact counts the Phase 3A review approved. A backfill run must refuse to
 * write unless the live plan reproduces them, so a drifted database can never be
 * silently backfilled against a stale approval.
 */
export interface ApprovedBackfillCounts {
  assignments: number;
  violations: number;
  canonical: number;
  contextRoot: number;
  legacyCompatible: number;
  unparented: number;
}

export interface BackfillGuardMismatch {
  key: keyof ApprovedBackfillCounts;
  expected: number;
  actual: number;
}

export interface BackfillGuardResult {
  ok: boolean;
  actual: ApprovedBackfillCounts;
  mismatches: BackfillGuardMismatch[];
}

/**
 * Compares a plan summary against the approved counts. Pure. Returns every
 * mismatch so the caller can report precisely what diverged before refusing to
 * write.
 */
export function evaluateBackfillGuard(
  summary: BackfillSummary,
  expected: ApprovedBackfillCounts,
): BackfillGuardResult {
  const actual: ApprovedBackfillCounts = {
    assignments: summary.proposedAssignments,
    violations: summary.violations.count,
    canonical: summary.canonical.count,
    contextRoot: summary.contextRoot.count,
    legacyCompatible: summary.legacyCompatible.count,
    unparented: summary.unparented,
  };

  const mismatches: BackfillGuardMismatch[] = [];
  for (const key of Object.keys(expected) as Array<
    keyof ApprovedBackfillCounts
  >) {
    if (actual[key] !== expected[key]) {
      mismatches.push({ key, expected: expected[key], actual: actual[key] });
    }
  }

  return { ok: mismatches.length === 0, actual, mismatches };
}

const REASON_BY_CLASSIFICATION: Record<
  LocationHierarchyRelationshipKind,
  string
> = {
  canonical:
    "canonical physical containment — parentId is a canonical direct parent",
  "context-root":
    "context-root ownership — parent is a space that may own this physical root",
  "legacy-compatible":
    "documented legacy-compatible relationship — preserved as physical containment",
  violation:
    "not canonical, context-root, or legacy-compatible — physical container left NULL (no guessing)",
};

/**
 * Computes the proposed `containerId` for every current `parentId` relationship.
 * Pure: never reads or writes a database, and never mutates `locations`.
 */
export function planPhysicalContainerBackfill(
  locations: readonly BackfillLocationInput[],
): BackfillPlan {
  const byId = new Map(locations.map((location) => [location.id, location]));

  const proposals: BackfillProposal[] = [];
  const issues: BackfillValidationIssue[] = [];

  let unparented = 0;
  let alreadyPopulated = 0;
  let canonicalCount = 0;
  let contextRootCount = 0;
  let legacyCount = 0;
  let proposedAssignments = 0;
  const violationBreakdown = new Map<string, number>();

  for (const child of locations) {
    if (child.containerId !== null) alreadyPopulated += 1;

    if (child.parentId === null) {
      unparented += 1;
      continue; // no relationship → no proposal (never infer a container)
    }

    const parent = byId.get(child.parentId);
    const classification = classifyLocationHierarchyRelationship(
      parent?.kind ?? null,
      child.kind,
    );

    const pair = `${parent?.kind ?? "<missing>"} → ${child.kind}`;

    // Proposal: a violation never receives a container; everything else mirrors
    // the organizational parent, which is the only physical evidence we have.
    const shouldPropose = classification.kind !== "violation";
    const proposedContainerId = shouldPropose ? child.parentId : null;

    if (classification.kind === "canonical") canonicalCount += 1;
    else if (classification.kind === "context-root") contextRootCount += 1;
    else if (classification.kind === "legacy-compatible") legacyCount += 1;
    else
      violationBreakdown.set(pair, (violationBreakdown.get(pair) ?? 0) + 1);

    if (proposedContainerId !== null) proposedAssignments += 1;

    const proposal: BackfillProposal = {
      childId: child.id,
      childCode: child.code,
      childKind: child.kind,
      parentId: child.parentId,
      parentCode: parent?.code ?? "<missing>",
      parentKind: parent?.kind ?? "<missing>",
      classification: classification.kind,
      proposedContainerId,
      proposedContainerCategory:
        proposedContainerId !== null
          ? (normalizeLocationCategory(parent?.kind) ?? null)
          : null,
      reason: REASON_BY_CLASSIFICATION[classification.kind],
    };
    proposals.push(proposal);

    // ---- Safety validation (fail rather than guess) ----------------------
    if (classification.kind === "violation" && proposedContainerId !== null) {
      issues.push({
        code: "VIOLATION_PROPOSED",
        childId: child.id,
        childCode: child.code,
        message: `Violation '${pair}' must not receive a container proposal.`,
      });
    }

    // A dangling organizational parent and a self-parent are integrity defects
    // that must surface regardless of classification.
    if (!parent) {
      issues.push({
        code: "PARENT_MISSING",
        childId: child.id,
        childCode: child.code,
        message: `Location '${child.code}' references parent ${child.parentId}, which does not exist.`,
      });
      continue;
    }
    if (child.parentId === child.id) {
      issues.push({
        code: "SELF_CONTAINER",
        childId: child.id,
        childCode: child.code,
        message: `Location '${child.code}' would be its own container.`,
      });
    }

    if (proposedContainerId === null) continue;

    if (!parent.isActive) {
      issues.push({
        code: "INACTIVE_CONTAINER",
        childId: child.id,
        childCode: child.code,
        message: `Proposed container '${parent.code}' is inactive.`,
      });
    }

    // The canonical predicate is the authority for canonical and context-root
    // edges. Legacy-compatible pairs are, by definition, NOT canonical (that is
    // why they are listed separately), so they are exempt from this check — the
    // documented legacy pair is itself the authority that preserves them.
    if (
      classification.kind !== "legacy-compatible" &&
      !canBePhysicalContainer(parent.kind, child.kind)
    ) {
      issues.push({
        code: "PREDICATE_FAILED",
        childId: child.id,
        childCode: child.code,
        message: `'${parent.kind}' cannot physically contain '${child.kind}' (canBePhysicalContainer is false).`,
      });
    }
  }

  // ---- Cycle validation over the PROPOSED container graph -----------------
  const proposedByChild = new Map<string, string>();
  for (const proposal of proposals) {
    if (proposal.proposedContainerId !== null) {
      proposedByChild.set(proposal.childId, proposal.proposedContainerId);
    }
  }
  for (const [childId, containerId] of proposedByChild) {
    const visited = new Set<string>([childId]);
    let current: string | undefined = containerId;
    while (current !== undefined && proposedByChild.has(current)) {
      if (visited.has(current)) {
        const child = byId.get(childId);
        issues.push({
          code: "CONTAINER_CYCLE",
          childId,
          childCode: child?.code ?? childId,
          message: `Proposed container graph contains a cycle reaching '${child?.code ?? current}'.`,
        });
        break;
      }
      visited.add(current);
      current = proposedByChild.get(current);
    }
  }

  const violationsCount = [...violationBreakdown.values()].reduce(
    (sum, n) => sum + n,
    0,
  );

  const summary: BackfillSummary = {
    locationsScanned: locations.length,
    relationshipsScanned: proposals.length,
    alreadyPopulated,
    unparented,
    canonical: { count: canonicalCount, proposed: canonicalCount },
    contextRoot: { count: contextRootCount, proposed: contextRootCount },
    legacyCompatible: { count: legacyCount, proposed: legacyCount },
    violations: {
      count: violationsCount,
      proposedNull: violationsCount,
      breakdown: [...violationBreakdown.entries()]
        .map(([pair, count]) => ({ pair, count }))
        .sort((a, b) => b.count - a.count || a.pair.localeCompare(b.pair)),
    },
    proposedAssignments,
    proposedNull: violationsCount,
    unchangedNull: unparented + violationsCount,
  };

  return {
    proposals,
    summary,
    validation: { safe: issues.length === 0, issues },
  };
}