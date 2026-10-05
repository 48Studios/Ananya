import { normalizeSpatialKind } from "@ananya/inventory";
import type { ParametricTemplateType } from "@ananya/inventory";

export type SpatialModelStructure =
  | "rack"
  | "reel-rack"
  | "tray"
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

export interface SpatialTemplateModelDefinition {
  templateType: ParametricTemplateType;
  displayName: string;
  supportedRootKinds: readonly string[];
  modelKinds: readonly string[];
  structure: SpatialModelStructure;
}

const physical = (
  kind: string,
  displayName: string,
  dimensionsMm: SpatialModelDimensionsMm,
  structure: Exclude<SpatialModelStructure, "none" | "warehouse">,
): SpatialModelDefinition => ({
  kind,
  modelId: `procedural-${kind}`,
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
    { widthMm: 950, heightMm: 300, depthMm: 350 },
    "rack",
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
  tray: physical(
    "tray",
    "Tray",
    { widthMm: 600, heightMm: 80, depthMm: 300 },
    "tray",
  ),
  tube: physical(
    "tube",
    "Tube",
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
    "tray",
  ),
  slot: physical(
    "slot",
    "Slot",
    { widthMm: 100, heightMm: 80, depthMm: 140 },
    "tray",
  ),
  warehouse: context("warehouse", "Warehouse", "warehouse"),
  building: context("building", "Building", "warehouse"),
  facility: context("facility", "Facility", "warehouse"),
  room: context("room", "Room", "none"),
  zone: context("zone", "Zone", "none"),
  aisle: context("aisle", "Aisle", "none"),
};

/**
 * Parametric topology is separate from physical representation. These entries
 * describe which registered physical model family owns each template while
 * leaving slot generation to the inventory parametric engine.
 */
export const SPATIAL_TEMPLATE_MODEL_DEFINITIONS: Readonly<
  Record<ParametricTemplateType, SpatialTemplateModelDefinition>
> = {
  SMD_DRAWER_CABINET: {
    templateType: "SMD_DRAWER_CABINET",
    displayName: "Cabinet / Dry Cabinet",
    supportedRootKinds: ["cabinet", "dry_cabinet"],
    modelKinds: ["cabinet", "dry_cabinet"],
    structure: "enclosure",
  },
  OPEN_BIN_MATRIX: {
    templateType: "OPEN_BIN_MATRIX",
    displayName: "Cabinet / Dry Cabinet bin matrix",
    supportedRootKinds: ["cabinet", "dry_cabinet"],
    modelKinds: ["cabinet", "dry_cabinet"],
    structure: "enclosure",
  },
  PALLET_RACK: {
    templateType: "PALLET_RACK",
    displayName: "Rack / Shelf / Reel Rack",
    supportedRootKinds: [
      "rack",
      "shelf",
      "reel_rack",
      "warehouse",
      "building",
      "facility",
    ],
    modelKinds: ["rack", "shelf", "reel_rack"],
    structure: "rack",
  },
  GRID_PARTS_TRAY: {
    templateType: "GRID_PARTS_TRAY",
    displayName: "Tray",
    supportedRootKinds: ["tray"],
    modelKinds: ["tray"],
    structure: "tray",
  },
};

export function resolveTemplateSpatialModel(
  templateType: ParametricTemplateType | string | null | undefined,
  rootKind?: string | null,
): SpatialModelDefinition | null {
  const template = templateType
    ? SPATIAL_TEMPLATE_MODEL_DEFINITIONS[templateType as ParametricTemplateType]
    : undefined;
  if (!template) return null;
  const normalizedRoot = normalizeSpatialKind(rootKind);
  const modelKind =
    template.modelKinds.find((kind) => kind === normalizedRoot) ??
    template.modelKinds[0];
  return resolveSpatialModel(modelKind);
}

export const SUPPORTED_PHYSICAL_LOCATION_KINDS = Object.freeze(
  Object.values(SPATIAL_MODEL_DEFINITIONS)
    .filter((definition) => definition.category === "physical")
    .map((definition) => definition.kind),
);

export const SUPPORTED_CONTEXT_LOCATION_KINDS = Object.freeze(
  Object.values(SPATIAL_MODEL_DEFINITIONS)
    .filter((definition) => definition.category === "context")
    .map((definition) => definition.kind),
);

export function resolveSpatialModel(
  kind: string | null | undefined,
): SpatialModelDefinition | null {
  return SPATIAL_MODEL_DEFINITIONS[normalizeSpatialKind(kind)] ?? null;
}

export function isSupportedPhysicalLocationKind(
  kind: string | null | undefined,
): boolean {
  return resolveSpatialModel(kind)?.category === "physical";
}
