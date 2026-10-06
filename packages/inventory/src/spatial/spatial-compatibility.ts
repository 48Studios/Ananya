import {
  PARAMETRIC_TEMPLATE_TYPES,
  type CompartmentKind,
  type ParametricTemplateType,
} from "./parametric";
import { INCOMPATIBLE_COMPARTMENT_KINDS } from "./spatial-layout.types";
import {
  SPATIAL_CATEGORY_DEFINITIONS,
  canContainLocationWithinHierarchy,
  canContainLocation,
  normalizeLocationCategory,
  resolveBuilderRootCategories,
} from "./location-model";

/**
 * Kind vocabulary for spatial locations.
 *
 * Canonical classification is derived from the canonical taxonomy
 * (`SPATIAL_CATEGORY_DEFINITIONS`): a context category is a space, a physical
 * category with no containment capability is a compartment, and every other
 * physical category is a container. Only the legacy overrides below are stated
 * locally.
 */
const SPACE_KINDS = new Set([...INCOMPATIBLE_COMPARTMENT_KINDS, "aisle"]);

/**
 * Legacy classification overrides.
 *
 * Persisted data and existing mappings were classified with a hand-maintained
 * vocabulary in which `drawer`, `bin`, `tray` and `slot` were compartment-level
 * kinds. The canonical taxonomy describes most of them differently (`matrix_tray`
 * and a `drawer`/`bin` are containers; `slot` is not a category at all), so
 * deriving their class purely from the canonical category would change the
 * verdict for data that has not changed. Their legacy class is therefore stated
 * explicitly.
 *
 * This is the deliberate split between canonical IDENTITY (category-first model
 * resolution) and legacy COMPATIBILITY semantics. Remove an entry only after the
 * corresponding persisted rows and mapping snapshots have been canonicalized.
 */
const LEGACY_CLASSIFICATION_OVERRIDES: Readonly<
  Record<string, SpatialKindClass>
> = {
  drawer: "compartment",
  bin: "compartment",
  tray: "compartment",
  slot: "compartment",
};

/**
 * Storage kinds that may occupy a generated compartment slot.
 *
 * Derived from the parametric templates and from how the shipped demo layouts
 * are actually mapped:
 *   * `SMD_DRAWER_CABINET` generates `drawer` slots, mapped to `drawer`
 *     locations (`LAYOUT-CAB-A/B/C`) or nested bins/compartments.
 *   * `OPEN_BIN_MATRIX` generates `bin` slots, mapped to `bin` locations
 *     (`DEMO-SPATIAL-LAYOUT-OPEN-BINS`).
 *   * `PALLET_RACK` generates `shelf` slots: they are bay/pallet positions that
 *     hold a storage unit, i.e. a `shelf`, a nested `rack` (`RACK-A`) or a
 *     `cabinet` (`DEMO-SPATIAL-WAREHOUSE` bay plan).
 *   * `GRID_PARTS_TRAY` generates `slot` cells, mapped to `bin` locations
 *     (`LAYOUT-TRAY`, where tray cells are recorded as `bin`).
 */
export const SLOT_CANDIDATE_KINDS: Readonly<
  Record<CompartmentKind, readonly string[]>
> = {
  drawer: ["drawer", "bin", "compartment"],
  bin: ["bin", "compartment", "tray", "matrix_tray"],
  shelf: [
    "shelf",
    "rack",
    "cabinet",
    "dry_cabinet",
    "reel_rack",
    "bin",
    "tray",
    "matrix_tray",
    "compartment",
  ],
  slot: [
    "bin",
    "compartment",
    "slot",
    "tray",
    "matrix_tray",
    "tube",
    "ic_tube_rail",
    "reel_slot",
  ],
  reel_slot: ["reel_slot"],
  matrix_tray: ["matrix_tray", "tray"],
  compartment: ["compartment"],
};

/**
 * Canonical physical root category selected by each Builder preset.
 *
 * This is deliberately separate from `SLOT_CANDIDATE_KINDS`: a root is the
 * physical structure that owns the generated layout, while a slot candidate is
 * a location stored inside one generated compartment.
 *
 * Context categories and legacy location kinds are intentionally excluded from
 * Builder roots. Warehouse composition is handled by the broader hierarchy.
 */
export const ROOT_CANDIDATE_KINDS: Readonly<
  Record<ParametricTemplateType, readonly string[]>
> = {
  SMD_DRAWER_CABINET: resolveBuilderRootCategories("SMD_DRAWER_CABINET"),
  OPEN_BIN_MATRIX: resolveBuilderRootCategories("OPEN_BIN_MATRIX"),
  PALLET_RACK: resolveBuilderRootCategories("PALLET_RACK"),
  GRID_PARTS_TRAY: resolveBuilderRootCategories("GRID_PARTS_TRAY"),
  REEL_RACK: resolveBuilderRootCategories("REEL_RACK"),
  DRY_CABINET: resolveBuilderRootCategories("DRY_CABINET"),
};

/**
 * Stable prefix for the stale reason written when a persisted mapping is no
 * longer kind-compatible. Shared so the API and the builder UI produce the same
 * text — the acknowledgment signature is computed over that text.
 */
export const INCOMPATIBLE_MAPPING_STALE_PREFIX =
  "Incompatible compartment kind";

/** Physical class of a location kind, used for compatibility decisions. */
export type SpatialKindClass =
  "space" | "container" | "compartment" | "unclassified";

export type SpatialMappingIncompatibilityCode = "SPACE_CANDIDATE" | "SLOT_KIND";

export type SpatialRootIncompatibilityCode = "ROOT_KIND";

export interface SpatialRootCompatibility {
  compatible: boolean;
  code: SpatialRootIncompatibilityCode | null;
  reason: string | null;
  expectedRootKind: string;
  candidateRootKind: string;
}

/**
 * Checks a root/container family against a candidate root location kind.
 *
 * Unlike slot compatibility, this function never considers a generated slot
 * kind or a child location kind.
 */
export function checkRootTypeCompatibility(
  rootKind: string | null | undefined,
  candidateRootKind: string | null | undefined,
): SpatialRootCompatibility {
  const expectedRootKind = normalizeSpatialKind(rootKind);
  const candidate = normalizeSpatialKind(candidateRootKind);
  const compatible =
    Boolean(expectedRootKind) &&
    Boolean(candidate) &&
    normalizeLocationCategory(expectedRootKind) ===
      normalizeLocationCategory(candidate);

  return {
    compatible,
    code: compatible ? null : "ROOT_KIND",
    reason: compatible
      ? null
      : `Incompatible root kind: a ${describe(
          expectedRootKind || "unknown",
        )} root cannot use a ${describe(candidate || "unknown")} location`,
    expectedRootKind,
    candidateRootKind: candidate,
  };
}

export function isRootTypeCompatible(
  rootKind: string | null | undefined,
  candidateRootKind: string | null | undefined,
): boolean {
  return checkRootTypeCompatibility(rootKind, candidateRootKind).compatible;
}

export function resolveRootCandidateKinds(
  templateType: ParametricTemplateType,
): readonly string[] {
  return ROOT_CANDIDATE_KINDS[templateType] ?? [];
}

/**
 * Returns Builder templates that can use a location kind as their root.
 *
 * This is intentionally derived from root compatibility, never from slot
 * compatibility, so a location can remain a valid Builder root regardless of
 * what the generated compartments may contain.
 */
export function resolveTemplateTypesForRootKind(
  rootKind: string | null | undefined,
): readonly ParametricTemplateType[] {
  const candidate = normalizeSpatialKind(rootKind);
  if (!candidate) return [];
  return PARAMETRIC_TEMPLATE_TYPES.filter((templateType) =>
    isTemplateRootCompatible(templateType, candidate),
  );
}

export function isTemplateRootCompatible(
  templateType: ParametricTemplateType,
  candidateRootKind: string | null | undefined,
): boolean {
  const candidate = normalizeSpatialKind(candidateRootKind);
  const normalized = normalizeLocationCategory(candidate);
  return (
    normalized !== null &&
    resolveRootCandidateKinds(templateType).some(
      (kind) => normalizeLocationCategory(kind) === normalized,
    )
  );
}

export interface SpatialMappingCompatibilityInput {
  /**
   * Kind of the location that owns the layout (the builder root), when known.
   * This is descriptive context only; root validity is checked by
   * `checkRootTypeCompatibility` / `isTemplateRootCompatible`.
   */
  rootKind?: string | null;
  /** Kind of the location being mapped into a compartment. */
  candidateKind?: string | null;
  /** Kind of the generated compartment slot; omitted for anchor-only mappings. */
  slotKind?: CompartmentKind | null;
}

export interface SpatialMappingCompatibility {
  compatible: boolean;
  code: SpatialMappingIncompatibilityCode | null;
  /** Stable, human-readable explanation; also used as the stale reason. */
  reason: string | null;
  rootClass: SpatialKindClass | null;
  candidateClass: SpatialKindClass | null;
}

/** Lowercases and normalizes separators so `Dry Cabinet`, `dry-cabinet` and `dry_cabinet` agree. */
export function normalizeSpatialKind(kind: string | null | undefined): string {
  return (kind ?? "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

export function classifySpatialKind(
  kind: string | null | undefined,
): SpatialKindClass {
  const normalized = normalizeSpatialKind(kind);
  if (!normalized) return "unclassified";
  // Legacy overrides win first: their semantics must not drift with the
  // canonical identity change (see LEGACY_CLASSIFICATION_OVERRIDES).
  const override = LEGACY_CLASSIFICATION_OVERRIDES[normalized];
  if (override) return override;
  if (SPACE_KINDS.has(normalized)) return "space";
  // Every remaining class comes from the canonical taxonomy, so the classifier
  // and the containment graph can never disagree.
  const category = normalizeLocationCategory(normalized);
  if (category === null) return "unclassified";
  const definition = SPATIAL_CATEGORY_DEFINITIONS[category];
  if (definition.classification === "context") return "space";
  return definition.container === "no" ? "compartment" : "container";
}

/** True for kinds that represent walkable volume rather than physical equipment. */
export function isSpatialSpaceKind(kind: string | null | undefined): boolean {
  return classifySpatialKind(kind) === "space";
}

/** Candidate kinds a generated slot of the given kind accepts. */
export function resolveSlotCandidateKinds(
  slotKind: CompartmentKind | null | undefined,
): readonly string[] {
  if (!slotKind) return [];
  return SLOT_CANDIDATE_KINDS[slotKind] ?? [];
}

function describe(kind: string): string {
  return `"${normalizeSpatialKind(kind)}"`;
}

/**
 * Shared compatibility decision used by the API and Builder.
 *
 * Known physical root/child pairs use the canonical category graph. Legacy
 * slot-kind checks remain for anchor-only or unclassified historical mappings.
 */
export function checkSpatialMappingCompatibility(
  input: SpatialMappingCompatibilityInput,
): SpatialMappingCompatibility {
  const { rootKind, candidateKind, slotKind } = input;
  const rootClass = classifySpatialKind(rootKind);
  const candidateClass = classifySpatialKind(candidateKind);

  const spaceReason =
    candidateClass === "space"
      ? `${INCOMPATIBLE_MAPPING_STALE_PREFIX}: ${describe(
          candidateKind ?? "",
        )} is a space and cannot occupy a compartment slot`
      : null;

  if (spaceReason) {
    return {
      compatible: false,
      code: "SPACE_CANDIDATE",
      reason: spaceReason,
      rootClass,
      candidateClass,
    };
  }

  // When the root is known, use the canonical category graph. Template slot
  // topology is only a preset; it does not grant category containment.
  if (
    rootKind &&
    candidateKind &&
    normalizeLocationCategory(rootKind) &&
    normalizeLocationCategory(candidateKind) &&
    rootClass !== "space"
  ) {
    // Pallet Rack's generated `shelf` slots are the direct Rack → Shelf edge.
    // Descendant categories belong in a Shelf's own layout and must not be
    // offered as direct rack-level mappings.
    if (
      normalizeLocationCategory(rootKind) === "rack" &&
      slotKind === "shelf" &&
      normalizeLocationCategory(candidateKind) !== "shelf"
    ) {
      return {
        compatible: false,
        code: "SLOT_KIND",
        reason: `${INCOMPATIBLE_MAPPING_STALE_PREFIX}: a shelf level in a Rack accepts Shelf locations`,
        rootClass,
        candidateClass,
      };
    }
    if (
      normalizeLocationCategory(rootKind) === "dry_cabinet" &&
      !canContainLocation(rootKind, candidateKind)
    ) {
      return {
        compatible: false,
        code: "SLOT_KIND",
        reason: `${INCOMPATIBLE_MAPPING_STALE_PREFIX}: Dry Cabinet roots accept only their canonical direct child categories`,
        rootClass,
        candidateClass,
      };
    }
    if (
      normalizeLocationCategory(rootKind) === "matrix_tray" &&
      !canContainLocation(rootKind, candidateKind)
    ) {
      return {
        compatible: false,
        code: "SLOT_KIND",
        reason: `${INCOMPATIBLE_MAPPING_STALE_PREFIX}: Matrix Tray roots accept only Compartment locations`,
        rootClass,
        candidateClass,
      };
    }
    if (!canContainLocationWithinHierarchy(rootKind, candidateKind)) {
      return {
        compatible: false,
        code: "SLOT_KIND",
        reason: `${INCOMPATIBLE_MAPPING_STALE_PREFIX}: ${describe(rootKind)} cannot contain ${describe(candidateKind)}${slotKind ? ` in a ${describe(slotKind)} slot` : ""}`,
        rootClass,
        candidateClass,
      };
    }
    return {
      compatible: true,
      code: null,
      reason: null,
      rootClass,
      candidateClass,
    };
  }

  if (slotKind) {
    const allowed = resolveSlotCandidateKinds(slotKind);
    const normalizedCandidate = normalizeSpatialKind(candidateKind);
    if (normalizedCandidate) {
      // Canonical-aware comparison: a legacy token (`tray`, `tube`) and its
      // canonical category (`matrix_tray`, `ic_tube_rail`) are the same kind, so
      // a slot list may list either spelling and still accept both.
      const candidateCategory = normalizeLocationCategory(normalizedCandidate);
      const permitted = allowed.some((token) => {
        if (token === normalizedCandidate) return true;
        const tokenCategory = normalizeLocationCategory(token);
        return (
          candidateCategory !== null &&
          tokenCategory !== null &&
          tokenCategory === candidateCategory
        );
      });
      if (!permitted) {
        return {
          compatible: false,
          code: "SLOT_KIND",
          reason: `${INCOMPATIBLE_MAPPING_STALE_PREFIX}: a ${describe(
            slotKind,
          )} compartment cannot hold a ${describe(candidateKind ?? "")} location`,
          rootClass,
          candidateClass,
        };
      }
    }
  }

  return {
    compatible: true,
    code: null,
    reason: null,
    rootClass,
    candidateClass,
  };
}

export function isSpatiallyCompatible(
  input: SpatialMappingCompatibilityInput,
): boolean {
  return checkSpatialMappingCompatibility(input).compatible;
}

export interface SpatialMappingIncompatibility {
  slotId: string;
  locationId: string;
  candidateKind: string;
  slotKind: CompartmentKind | null;
  code: SpatialMappingIncompatibilityCode;
  reason: string;
}

/**
 * Evaluates every mapping of a layout against the kind compatibility rules.
 *
 * Shared by the API (server-side rejection on save/publish) and the Inventory
 * Builder (pre-save surfacing of the same verdicts) so both sides can never
 * disagree about what is valid.
 */
export function findSpatialMappingIncompatibilities(
  mappings: readonly { slotId: string; locationId: string }[],
  context: {
    rootKind?: string | null;
    kindsByLocationId: ReadonlyMap<string, string>;
    slotKindsBySlotId: ReadonlyMap<string, CompartmentKind>;
  },
): SpatialMappingIncompatibility[] {
  const violations: SpatialMappingIncompatibility[] = [];
  for (const mapping of mappings) {
    const candidateKind = context.kindsByLocationId.get(mapping.locationId);
    if (!candidateKind) continue;
    const slotKind = context.slotKindsBySlotId.get(mapping.slotId) ?? null;
    const verdict = checkSpatialMappingCompatibility({
      rootKind: context.rootKind,
      candidateKind,
      slotKind,
    });
    if (verdict.compatible || !verdict.code || !verdict.reason) continue;
    violations.push({
      slotId: mapping.slotId,
      locationId: mapping.locationId,
      candidateKind: normalizeSpatialKind(candidateKind),
      slotKind,
      code: verdict.code,
      reason: verdict.reason,
    });
  }
  return violations;
}

/**
 * Allowed/rejected verdict for a root/child pair under a template's slot kind.
 * Root eligibility itself is intentionally handled by the root predicates
 * above, not by this slot predicate.
 */
export function describeSpatialCompatibility(
  rootKind: string | null | undefined,
  candidateKind: string | null | undefined,
  slotKind: CompartmentKind | null | undefined,
): string {
  const verdict = checkSpatialMappingCompatibility({
    rootKind,
    candidateKind,
    slotKind,
  });
  if (verdict.compatible) {
    return `allowed: ${normalizeSpatialKind(rootKind) || "unknown"} root with ${describe(
      slotKind ?? "unspecified",
    )} compartments accepts ${describe(candidateKind ?? "")}`;
  }
  return `rejected (${verdict.code}): ${verdict.reason}`;
}
