import {
  canBePhysicalContainer,
  classifyLocationHierarchyRelationship,
  isContextRootCategory,
  isPhysicalRootCategory,
  normalizeLocationCategory,
  SPATIAL_CATEGORY_DEFINITIONS,
} from "./location-model";

/**
 * RFC-0069 — physical-containment integrity verifier (pure, READ-ONLY).
 *
 * Validates the persisted `containerId` graph against the canonical physical
 * containment rules. Used by the read-only
 * `tools/spatial-integrity/verify-physical-containment.mjs` harness and unit
 * tested for every failure class.
 *
 * It never reads or writes a database and never mutates its input.
 */

export interface PhysicalContainmentLocation {
  readonly id: string;
  readonly code: string;
  readonly kind: string;
  readonly parentId: string | null;
  readonly containerId: string | null;
  readonly isActive: boolean;
}

export type PhysicalContainmentIssueCode =
  | "DANGLING_CONTAINER"
  | "INACTIVE_CONTAINER"
  | "SELF_CONTAINER"
  | "CONTAINER_CYCLE"
  | "INVALID_CATEGORY"
  | "CONTEXT_ROOT_RULE"
  | "NON_ROOT_CONTAINER"
  | "NON_DETERMINISTIC_ANCESTRY"
  | "PARENTID_DRIFT"
  | "LEDGER_DRIFT";

export interface PhysicalContainmentIntegrityIssue {
  code: PhysicalContainmentIssueCode;
  locationId: string;
  locationCode: string;
  message: string;
}

export interface PhysicalContainmentIntegrityReport {
  /** True when there are zero `error`-severity issues. */
  ok: boolean;
  errors: PhysicalContainmentIntegrityIssue[];
  /** Informational classifications (e.g. documented legacy pairs) — not failures. */
  legacyCompatible: Array<{
    childId: string;
    childCode: string;
    containerId: string;
    containerCode: string;
    pair: string;
  }>;
  counts: {
    locations: number;
    populated: number;
    containers: number;
    contextRootRelationships: number;
    legacyCompatibleRelationships: number;
    maxContainerDepth: number;
  };
}

export interface PhysicalContainmentVerifierOptions {
  /**
   * Expected `id → parentId` map captured before a mutation. When provided,
   * any drift is reported as `PARENTID_DRIFT` (RFC-0069: parentId is immutable
   * during the backfill).
   */
  readonly expectedParentById?: ReadonlyMap<string, string | null>;
  /**
   * Observed inventory ledger row count (passed in by the harness). Compared
   * against `expectedLedgerCount`; the verifier itself never reads the ledger.
   */
  readonly observedLedgerCount?: number;
  /** Expected inventory ledger row count. When provided, drift is `LEDGER_DRIFT`. */
  readonly expectedLedgerCount?: number;
}

/** Categories that can never be a physical container. */
const NON_CONTAINER_CATEGORIES = new Set(["compartment", "reel_slot"]);

export function verifyPhysicalContainmentIntegrity(
  locations: readonly PhysicalContainmentLocation[],
  options: PhysicalContainmentVerifierOptions = {},
): PhysicalContainmentIntegrityReport {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const errors: PhysicalContainmentIntegrityIssue[] = [];
  const legacyCompatible: PhysicalContainmentIntegrityReport["legacyCompatible"] =
    [];

  const add = (
    code: PhysicalContainmentIssueCode,
    location: PhysicalContainmentLocation,
    message: string,
  ) => {
    errors.push({
      code,
      locationId: location.id,
      locationCode: location.code,
      message,
    });
  };

  let populated = 0;
  let contextRootRelationships = 0;
  const containerIdsInUse = new Set<string>();

  for (const location of locations) {
    // (10) parentId immutability.
    if (options.expectedParentById) {
      const expected = options.expectedParentById.get(location.id);
      if (expected !== undefined && expected !== location.parentId) {
        add(
          "PARENTID_DRIFT",
          location,
          `parentId changed from ${expected ?? "null"} to ${location.parentId ?? "null"}.`,
        );
      }
    }

    if (location.containerId === null) continue;
    populated += 1;
    containerIdsInUse.add(location.containerId);

    // (3) no self-containment.
    if (location.containerId === location.id) {
      add("SELF_CONTAINER", location, "Location is its own physical container.");
      continue;
    }

    // (1) container must exist.
    const container = byId.get(location.containerId);
    if (!container) {
      add(
        "DANGLING_CONTAINER",
        location,
        `containerId ${location.containerId} references no existing location.`,
      );
      continue;
    }

    // (2) container must be active.
    if (!container.isActive) {
      add(
        "INACTIVE_CONTAINER",
        location,
        `Container '${container.code}' is inactive.`,
      );
    }

    // (5) category relationship must satisfy the canonical predicate.
    const relationship = classifyLocationHierarchyRelationship(
      container.kind,
      location.kind,
    );
    if (relationship.kind === "legacy-compatible") {
      // (7) documented legacy pair — explicitly classified, not a failure.
      legacyCompatible.push({
        childId: location.id,
        childCode: location.code,
        containerId: container.id,
        containerCode: container.code,
        pair: `${container.kind} → ${location.kind}`,
      });
    } else if (!canBePhysicalContainer(container.kind, location.kind)) {
      add(
        "INVALID_CATEGORY",
        location,
        `'${container.kind}' cannot physically contain '${location.kind}' (canBePhysicalContainer is false).`,
      );
    }

    // (6) context-root relationships must satisfy the context-root rule.
    if (isContextRootCategory(container.kind)) {
      contextRootRelationships += 1;
      const childCategory = normalizeLocationCategory(location.kind);
      const validChild =
        isContextRootCategory(location.kind) ||
        isPhysicalRootCategory(location.kind) ||
        (childCategory !== null &&
          SPATIAL_CATEGORY_DEFINITIONS[childCategory].classification ===
            "physical" &&
          SPATIAL_CATEGORY_DEFINITIONS[childCategory].root === "yes");
      if (!validChild) {
        add(
          "CONTEXT_ROOT_RULE",
          location,
          `Context root '${container.kind}' may contain only a context root or a physical root, not '${location.kind}'.`,
        );
      }
    }

    // (8) a compartment / reel-slot must never be a container.
    const containerCategory = normalizeLocationCategory(container.kind);
    if (
      containerCategory !== null &&
      NON_CONTAINER_CATEGORIES.has(containerCategory)
    ) {
      add(
        "NON_ROOT_CONTAINER",
        location,
        `'${container.kind}' is a leaf compartment and cannot be a physical container.`,
      );
    }
  }

  // (4) container cycles + (9) deterministic ancestry.
  let maxContainerDepth = 0;
  for (const location of locations) {
    if (location.containerId === null) continue;
    const seen = new Set<string>([location.id]);
    let current: string | null = location.containerId;
    let depth = 0;
    while (current !== null) {
      if (seen.has(current)) {
        add(
          "CONTAINER_CYCLE",
          location,
          `Container ancestry revisits '${byId.get(current)?.code ?? current}', forming a cycle.`,
        );
        depth = -1;
        break;
      }
      if (depth > locations.length) {
        add(
          "NON_DETERMINISTIC_ANCESTRY",
          location,
          "Container ancestry exceeds the location count (non-deterministic).",
        );
        depth = -1;
        break;
      }
      seen.add(current);
      depth += 1;
      current = byId.get(current)?.containerId ?? null;
    }
    if (depth > maxContainerDepth) maxContainerDepth = depth;
  }

  // (11) inventory ledger unchanged (only when a baseline is supplied).
  if (
    options.expectedLedgerCount !== undefined &&
    options.observedLedgerCount !== undefined &&
    options.expectedLedgerCount !== options.observedLedgerCount
  ) {
    errors.push({
      code: "LEDGER_DRIFT",
      locationId: "-",
      locationCode: "-",
      message: `inventory_transactions count changed from ${options.expectedLedgerCount} to ${options.observedLedgerCount}.`,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    legacyCompatible,
    counts: {
      locations: locations.length,
      populated,
      containers: containerIdsInUse.size,
      contextRootRelationships,
      legacyCompatibleRelationships: legacyCompatible.length,
      maxContainerDepth: Math.max(0, maxContainerDepth),
    },
  };
}