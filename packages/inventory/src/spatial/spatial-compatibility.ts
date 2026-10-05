import type { CompartmentKind, ParametricTemplateType } from "./parametric";
import { INCOMPATIBLE_COMPARTMENT_KINDS } from "./spatial-layout.types";

/**
 * Kind vocabulary for spatial locations.
 *
 * The set of kinds an operator can assign comes from the location form
 * (`warehouse | room | aisle | rack | shelf | cabinet | dry_cabinet | bin |
 * drawer | compartment | reel_rack | reel_slot | tray | tube`). The classifier
 * only constrains kinds the domain has physical semantics for. Anything else is
 * reported as `unclassified` and deliberately left unconstrained instead of
 * inventing a rule the domain does not state.
 */
const SPACE_KINDS = new Set([...INCOMPATIBLE_COMPARTMENT_KINDS, "aisle"]);
const CONTAINER_KINDS = new Set([
  "warehouse",
  "room",
  "aisle",
  "rack",
  "shelf",
  "cabinet",
  "dry_cabinet",
  "reel_rack",
]);
const COMPARTMENT_KINDS = new Set([
  "drawer",
  "bin",
  "compartment",
  "slot",
  "reel_slot",
  "tray",
  "tube",
]);

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
export const SLOT_CANDIDATE_KINDS: Readonly<Record<CompartmentKind, readonly string[]>> = {
  drawer: ["drawer", "bin", "compartment"],
  bin: ["bin", "compartment", "tray"],
  shelf: [
    "shelf",
    "rack",
    "cabinet",
    "dry_cabinet",
    "reel_rack",
    "bin",
    "tray",
    "compartment",
  ],
  slot: ["bin", "compartment", "slot", "tray", "tube", "reel_slot"],
};

/**
 * Root/container families accepted by each parametric template.
 *
 * This is deliberately separate from `SLOT_CANDIDATE_KINDS`: a root is the
 * physical structure that owns the generated layout, while a slot candidate is
 * a location stored inside one generated compartment.
 *
 * Warehouse/facility/building are allowed for the pallet-rack template because
 * the published warehouse bay plan is an intentional overview layout in the
 * demo and production model.
 */
export const ROOT_CANDIDATE_KINDS: Readonly<
  Record<ParametricTemplateType, readonly string[]>
> = {
  SMD_DRAWER_CABINET: ["cabinet", "dry_cabinet"],
  OPEN_BIN_MATRIX: ["cabinet", "dry_cabinet"],
  PALLET_RACK: [
    "rack",
    "shelf",
    "reel_rack",
    "warehouse",
    "building",
    "facility",
  ],
  GRID_PARTS_TRAY: ["tray"],
};

/**
 * Stable prefix for the stale reason written when a persisted mapping is no
 * longer kind-compatible. Shared so the API and the builder UI produce the same
 * text — the acknowledgment signature is computed over that text.
 */
export const INCOMPATIBLE_MAPPING_STALE_PREFIX = "Incompatible compartment kind";

/** Physical class of a location kind, used for compatibility decisions. */
export type SpatialKindClass = "space" | "container" | "compartment" | "unclassified";

export type SpatialMappingIncompatibilityCode =
  | "SPACE_CANDIDATE"
  | "SLOT_KIND";

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
    (expectedRootKind === candidate ||
      (expectedRootKind === "rack" &&
        ["rack", "shelf", "reel_rack"].includes(candidate)) ||
      (expectedRootKind === "cabinet" &&
        ["cabinet", "dry_cabinet"].includes(candidate)) ||
      (expectedRootKind === "tray" && candidate === "tray"));

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

export function isTemplateRootCompatible(
  templateType: ParametricTemplateType,
  candidateRootKind: string | null | undefined,
): boolean {
  const candidate = normalizeSpatialKind(candidateRootKind);
  return resolveRootCandidateKinds(templateType).includes(candidate);
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
  return (kind ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");
}

export function classifySpatialKind(kind: string | null | undefined): SpatialKindClass {
  const normalized = normalizeSpatialKind(kind);
  if (!normalized) return "unclassified";
  if (SPACE_KINDS.has(normalized)) return "space";
  if (CONTAINER_KINDS.has(normalized)) return "container";
  if (COMPARTMENT_KINDS.has(normalized)) return "compartment";
  return "unclassified";
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
 * Single source of truth for "may this child location be mapped into this slot".
 *
 * Space kinds are rejected outright. When a slot kind is known, only that
 * slot's declared candidate kinds are accepted — an `unclassified` kind is not
 * one of them, so it is reported as incompatible rather than silently allowed.
 * Without a slot kind (anchor-only mappings) no kind rule is applied beyond the
 * space check.
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

  if (slotKind) {
    const allowed = resolveSlotCandidateKinds(slotKind);
    const normalizedCandidate = normalizeSpatialKind(candidateKind);
    if (normalizedCandidate && !allowed.includes(normalizedCandidate)) {
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
