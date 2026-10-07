import { normalizeSpatialKind } from "@ananya/inventory";
import {
  BUILDER_PRESET_DEFINITIONS,
  CANONICAL_SPATIAL_MODEL_DEFINITIONS,
  SPATIAL_CATEGORY_DEFINITIONS,
  SPATIAL_LOCATION_CATEGORIES,
  createSpatialModelInstance,
  normalizeLocationCategory,
  type SpatialModelInstance,
} from "@ananya/inventory";

export type SpatialModelStructure =
  | "rack"
  | "shelf"
  | "reel-rack"
  | "tray"
  | "matrix-tray"
  | "compartment"
  | "drawer"
  | "tube"
  | "reel-slot"
  | "dry-cabinet"
  | "enclosure"
  | "warehouse"
  | "none";

export type SpatialModelCategory = "physical" | "context";

export interface SpatialModelDimensionsMm {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export interface SpatialModelAnchor {
  x: "center";
  y: "center";
  z: "center";
}

export interface SpatialModelBounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface SpatialModelDefinition {
  kind: string;
  modelId: string;
  displayName: string;
  category: SpatialModelCategory;
  dimensionsMm: SpatialModelDimensionsMm;
  anchor: SpatialModelAnchor;
  groundReference: "ground-plane";
  bounds: SpatialModelBounds;
  structure: SpatialModelStructure;
  geometryGenerator: "canonical-procedural";
  canNest: boolean;
  canCompose: boolean;
  isFallback: false;
}

export interface SpatialModelInstanceInput {
  locationId: string;
  kind: string;
  model: {
    id: string;
    widthMm: number | null;
    heightMm: number | null;
    depthMm: number | null;
  } | null;
}

/** Resolve a location against its configured persisted model dimensions. */
export function resolveLocationModelInstance(
  input: SpatialModelInstanceInput,
): SpatialModelInstance | null {
  const category = normalizeLocationCategory(input.kind);
  const model = input.model;
  if (
    !category ||
    !model ||
    model.widthMm == null ||
    model.heightMm == null ||
    model.depthMm == null
  ) {
    return null;
  }
  const result = createSpatialModelInstance(input.locationId, category, {
    widthMm: model.widthMm,
    heightMm: model.heightMm,
    depthMm: model.depthMm,
  });
  return result.valid ? result.instance : null;
}

/**
 * The model id a rendered definition must report.
 *
 * The spatial domain model foundation (`CANONICAL_SPATIAL_MODEL_DEFINITIONS`)
 * is the single authority for model identity, exactly as
 * `SPATIAL_CATEGORY_DEFINITIONS` is for category identity. A row whose `kind`
 * IS a canonical physical category therefore reports the canonical id, never a
 * locally minted `procedural-*` id — otherwise the *same* location kind would
 * have two model ids depending on which table a consumer read.
 *
 * A row whose `kind` is a legacy spelling (`tray`, `tube`, `slot`, …) keeps a
 * local id: `resolveSpatialModel` resolves such inputs to their canonical
 * category first, so these rows are never reachable through the public
 * resolver and their id can never disagree with a live location's identity.
 */
function canonicalModelId(kind: string): string {
  const category = normalizeLocationCategory(kind);
  const canonical =
    category === kind
      ? CANONICAL_SPATIAL_MODEL_DEFINITIONS[
          category as keyof typeof CANONICAL_SPATIAL_MODEL_DEFINITIONS
        ]
      : undefined;
  return canonical?.modelId ?? `procedural-${kind}`;
}

const physical = (
  kind: string,
  displayName: string,
  dimensionsMm: SpatialModelDimensionsMm,
  structure: Exclude<SpatialModelStructure, "none" | "warehouse">,
): SpatialModelDefinition => ({
  kind,
  modelId: canonicalModelId(kind),
  displayName,
  category: "physical",
  dimensionsMm,
  anchor: { x: "center", y: "center", z: "center" },
  groundReference: "ground-plane",
  bounds: {
    min: {
      x: -dimensionsMm.widthMm / 2,
      y: -dimensionsMm.heightMm / 2,
      z: -dimensionsMm.depthMm / 2,
    },
    max: {
      x: dimensionsMm.widthMm / 2,
      y: dimensionsMm.heightMm / 2,
      z: dimensionsMm.depthMm / 2,
    },
  },
  structure,
  geometryGenerator: "canonical-procedural",
  canNest: true,
  canCompose: true,
  isFallback: false,
});

const context = (
  kind: string,
  displayName: string,
  structure: "warehouse" | "none",
): SpatialModelDefinition => {
  const dimensionsMm =
    structure === "warehouse"
      ? { widthMm: 6000, heightMm: 3000, depthMm: 4000 }
      : { widthMm: 1, heightMm: 1, depthMm: 1 };
  return {
    ...physical(kind, displayName, dimensionsMm, "enclosure"),
    modelId: `context-${kind}`,
    category: "context",
    structure,
    canNest: false,
    canCompose: true,
  };
};
export const SPATIAL_MODEL_DEFINITIONS: Readonly<
  Record<string, SpatialModelDefinition>
> = {
  cabinet: physical(
    "cabinet",
    "Cabinet",
    { widthMm: 600, heightMm: 900, depthMm: 400 },
    "enclosure",
  ),
  dry_cabinet: physical(
    "dry_cabinet",
    "Dry Cabinet",
    { widthMm: 800, heightMm: 1800, depthMm: 600 },
    "dry-cabinet",
  ),
  rack: physical(
    "rack",
    "Rack",
    { widthMm: 1200, heightMm: 2100, depthMm: 600 },
    "rack",
  ),
  shelf: physical(
    "shelf",
    "Shelf",
    { widthMm: 950, heightMm: 40, depthMm: 550 },
    "shelf",
  ),
  reel_rack: physical(
    "reel_rack",
    "Reel Rack",
    { widthMm: 1000, heightMm: 1800, depthMm: 450 },
    "reel-rack",
  ),
  drawer: physical(
    "drawer",
    "Drawer",
    { widthMm: 180, heightMm: 70, depthMm: 350 },
    "drawer",
  ),
  bin: physical(
    "bin",
    "Bin",
    { widthMm: 80, heightMm: 60, depthMm: 120 },
    "tray",
  ),
  matrix_tray: physical(
    "matrix_tray",
    "Matrix Tray",
    { widthMm: 600, heightMm: 80, depthMm: 300 },
    "matrix-tray",
  ),
  /**
   * Legacy row, retained as documented-dead (2026-10, vocabulary consolidation).
   * It is unreachable: `tray` is an alias that `normalizeLocationCategory`
   * resolves to `matrix_tray` before the raw-token fallback in
   * `resolveSpatialModel`, so no input can select this row. Kept only so the
   * table still describes every historical spelling; it is NOT a competing
   * canonical identity. Dimensions are identical to `matrix_tray`, but the
   * structure differs (`tray` open-top vs `matrix-tray` divided) — no persisted
   * row reaches it, so no physical geometry changes.
   */
  tray: physical(
    "tray",
    "Tray",
    { widthMm: 600, heightMm: 80, depthMm: 300 },
    "tray",
  ),
  /** Legacy row, retained as documented-dead — see the `tray` note above. */
  tube: physical(
    "tube",
    "Tube",
    { widthMm: 40, heightMm: 40, depthMm: 120 },
    "tube",
  ),
  ic_tube_rail: physical(
    "ic_tube_rail",
    "IC Tube / Rail",
    { widthMm: 40, heightMm: 40, depthMm: 120 },
    "tube",
  ),
  reel_slot: physical(
    "reel_slot",
    "Reel Slot",
    { widthMm: 90, heightMm: 90, depthMm: 100 },
    "reel-slot",
  ),
  compartment: physical(
    "compartment",
    "Compartment",
    { widthMm: 100, heightMm: 80, depthMm: 140 },
    "compartment",
  ),
  /**
   * Legacy read-compatibility row, still reachable: `slot` has no canonical
   * category, so the raw-token fallback still selects it. Retained for existing
   * persisted `slot` values.
   */
  slot: physical(
    "slot",
    "Slot",
    { widthMm: 100, heightMm: 80, depthMm: 140 },
    "tray",
  ),
  warehouse: context("warehouse", "Warehouse", "warehouse"),
  room_area: context("room_area", "Room / Area", "warehouse"),
  building: context("building", "Building", "warehouse"),
  facility: context("facility", "Facility", "warehouse"),
  /**
   * Legacy read-compatibility row. Unreachable through
   * `resolveSpatialModel` (`room` → `room_area`), but retained: it shares
   * `room_area`'s `structure: "warehouse"`, so even a direct table access
   * renders the cutaway room shell consistently.
   */
  room: context("room", "Room", "warehouse"),
  zone: context("zone", "Zone", "none"),
  aisle: context("aisle", "Aisle", "none"),
};

export function resolveTemplateSpatialModel(
  templateType: string | null | undefined,
  rootKind?: string | null,
): SpatialModelDefinition | null {
  const preset = templateType
    ? BUILDER_PRESET_DEFINITIONS[
        templateType as keyof typeof BUILDER_PRESET_DEFINITIONS
      ]
    : undefined;
  if (!preset) return null;
  const requestedRoot = normalizeLocationCategory(rootKind);
  if (rootKind && requestedRoot !== preset.rootCategory) return null;
  // A Builder root is always a canonical physical category, so the model
  // resolved for it already carries the canonical model id — no override is
  // needed (and none may be introduced, or a template-rendered location could
  // report a different id than the same location rendered directly).
  return resolveSpatialModel(preset.rootCategory);
}

export const SUPPORTED_PHYSICAL_LOCATION_KINDS = Object.freeze(
  SPATIAL_LOCATION_CATEGORIES.filter(
    (category) =>
      SPATIAL_CATEGORY_DEFINITIONS[category].classification === "physical",
  ),
);

export const SUPPORTED_CONTEXT_LOCATION_KINDS = Object.freeze(
  SPATIAL_LOCATION_CATEGORIES.filter(
    (category) =>
      SPATIAL_CATEGORY_DEFINITIONS[category].classification === "context",
  ),
);

export function resolveSpatialModel(
  kind: string | null | undefined,
): SpatialModelDefinition | null {
  // Category-first: the canonical taxonomy is the authoritative identity, so
  // every alias of a category (`tray`/`tube`/`rail`/`ic_tube`/`room`/`area`)
  // resolves to exactly one canonical model. The raw-token table below is a
  // legacy fallback and can no longer shadow a canonical category.
  const category = normalizeLocationCategory(kind);
  if (category) return SPATIAL_MODEL_DEFINITIONS[category] ?? null;
  return SPATIAL_MODEL_DEFINITIONS[normalizeSpatialKind(kind)] ?? null;
}

export function isSupportedPhysicalLocationKind(
  kind: string | null | undefined,
): boolean {
  return resolveSpatialModel(kind)?.category === "physical";
}
