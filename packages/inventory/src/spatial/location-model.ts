import type {
  Dimensions3D,
  Position3D,
} from "./parametric/parametric-template.types";
import type { ParametricTemplateType } from "./parametric/parametric-template.types";

export const SPATIAL_LOCATION_CATEGORIES = [
  "warehouse",
  "room_area",
  "aisle",
  "rack",
  "shelf",
  "cabinet",
  "dry_cabinet",
  "bin",
  "drawer",
  "compartment",
  "reel_rack",
  "reel_slot",
  "matrix_tray",
  "ic_tube_rail",
] as const;

export type SpatialLocationCategory =
  (typeof SPATIAL_LOCATION_CATEGORIES)[number];
export type SpatialLocationClass = "context" | "physical";
export type RootCapability = "yes" | "conditional" | "no";
export type ContainerCapability = "yes" | "conditional" | "no";

export interface BuilderPresetDefinition {
  readonly type: ParametricTemplateType;
  readonly name: string;
  readonly description: string;
  readonly rootCategory: SpatialLocationCategory;
}

export interface SpatialCategoryDefinition {
  category: SpatialLocationCategory;
  modelId: string | null;
  displayName: string;
  classification: SpatialLocationClass;
  root: RootCapability;
  container: ContainerCapability;
  allowedChildren: readonly SpatialLocationCategory[];
}

export interface CanonicalSpatialModelDefinition {
  modelId: string;
  displayName: string;
  category: SpatialLocationCategory;
  geometry: "parametric";
  coordinateContract: "center-xz-ground-y";
  hasClearInterior: boolean;
}

const definition = (
  category: SpatialLocationCategory,
  displayName: string,
  root: RootCapability,
  container: ContainerCapability,
  allowedChildren: readonly SpatialLocationCategory[] = [],
): SpatialCategoryDefinition => ({
  category,
  modelId:
    category === "warehouse" || category === "room_area" || category === "aisle"
      ? null
      : `${category}-model`,
  displayName,
  classification:
    category === "warehouse" || category === "room_area" || category === "aisle"
      ? "context"
      : "physical",
  root,
  container,
  allowedChildren,
});

/** Canonical taxonomy and direct containment graph. Context categories have no Builder physical model. */
export const SPATIAL_CATEGORY_DEFINITIONS: Readonly<
  Record<SpatialLocationCategory, SpatialCategoryDefinition>
> = {
  warehouse: definition("warehouse", "Warehouse", "no", "no"),
  room_area: definition("room_area", "Room / Area", "no", "no"),
  aisle: definition("aisle", "Aisle", "no", "no"),
  rack: definition("rack", "Rack", "yes", "yes", ["shelf"]),
  shelf: definition("shelf", "Shelf", "yes", "yes", [
    "bin",
    "matrix_tray",
    "compartment",
    "ic_tube_rail",
  ]),
  cabinet: definition("cabinet", "Cabinet", "yes", "yes", ["drawer", "shelf"]),
  dry_cabinet: definition("dry_cabinet", "Dry Cabinet (MSD)", "yes", "yes", [
    "drawer",
    "shelf",
    "matrix_tray",
  ]),
  bin: definition("bin", "Bin", "yes", "conditional", ["compartment"]),
  drawer: definition("drawer", "Drawer", "yes", "yes", [
    "bin",
    "matrix_tray",
    "compartment",
    "ic_tube_rail",
  ]),
  compartment: definition("compartment", "Compartment", "conditional", "no"),
  reel_rack: definition("reel_rack", "Reel Rack", "yes", "yes", ["reel_slot"]),
  reel_slot: definition("reel_slot", "Reel Slot", "conditional", "no"),
  matrix_tray: definition("matrix_tray", "Matrix Tray", "yes", "yes", [
    "compartment",
  ]),
  ic_tube_rail: definition("ic_tube_rail", "IC Tube / Rail", "yes", "no"),
};

/** Builder workflows bind directly to one physical category in the canonical taxonomy. */
export const BUILDER_PRESET_DEFINITIONS: Readonly<
  Record<ParametricTemplateType, BuilderPresetDefinition>
> = Object.freeze({
  SMD_DRAWER_CABINET: {
    type: "SMD_DRAWER_CABINET",
    name: "SMD Cabinet",
    description: "SMD drawer arrangement",
    rootCategory: "cabinet",
  },
  OPEN_BIN_MATRIX: {
    type: "OPEN_BIN_MATRIX",
    name: "Open Bin",
    description: "Tiered open-bin arrangement",
    rootCategory: "bin",
  },
  PALLET_RACK: {
    type: "PALLET_RACK",
    name: "Pallet Rack",
    description: "Multi-level rack and bay arrangement",
    rootCategory: "rack",
  },
  GRID_PARTS_TRAY: {
    type: "GRID_PARTS_TRAY",
    name: "Parts Tray",
    description: "Divided matrix tray arrangement",
    rootCategory: "matrix_tray",
  },
  REEL_RACK: {
    type: "REEL_RACK",
    name: "Reel Rack",
    description: "Parametric reel-holder positions",
    rootCategory: "reel_rack",
  },
  DRY_CABINET: {
    type: "DRY_CABINET",
    name: "Dry Cabinet",
    description: "MSD enclosure with drawers, shelves, or matrix trays",
    rootCategory: "dry_cabinet",
  },
});

export const CANONICAL_SPATIAL_MODEL_DEFINITIONS: Readonly<
  Record<
    Exclude<SpatialLocationCategory, "warehouse" | "room_area" | "aisle">,
    CanonicalSpatialModelDefinition
  >
> = Object.freeze(
  Object.fromEntries(
    SPATIAL_LOCATION_CATEGORIES.filter(
      (category) =>
        SPATIAL_CATEGORY_DEFINITIONS[category].classification === "physical",
    ).map((category) => [
      category,
      {
        modelId: `${category}-model`,
        displayName: `${SPATIAL_CATEGORY_DEFINITIONS[category].displayName} Model`,
        category,
        geometry: "parametric",
        coordinateContract: "center-xz-ground-y",
        hasClearInterior:
          SPATIAL_CATEGORY_DEFINITIONS[category].container !== "no",
      },
    ]),
  ) as Record<
    Exclude<SpatialLocationCategory, "warehouse" | "room_area" | "aisle">,
    CanonicalSpatialModelDefinition
  >,
);

/** Normalizes the established persisted kind spellings without adding categories. */
export function normalizeLocationCategory(
  value: string | null | undefined,
): SpatialLocationCategory | null {
  const kind = (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[\s/-]+/g, "_");
  const aliases: Record<string, SpatialLocationCategory> = {
    room: "room_area",
    area: "room_area",
    dry_cabinet: "dry_cabinet",
    tray: "matrix_tray",
    matrix_tray: "matrix_tray",
    tube: "ic_tube_rail",
    rail: "ic_tube_rail",
    ic_tube: "ic_tube_rail",
    ic_tube_rail: "ic_tube_rail",
    room_area: "room_area",
    reel_slot: "reel_slot",
  };
  const candidate = aliases[kind] ?? kind;
  return Object.hasOwn(SPATIAL_CATEGORY_DEFINITIONS, candidate)
    ? (candidate as SpatialLocationCategory)
    : null;
}

export function canContainLocation(
  parent: string | null | undefined,
  child: string | null | undefined,
): boolean {
  const parentCategory = normalizeLocationCategory(parent);
  const childCategory = normalizeLocationCategory(child);
  return Boolean(
    parentCategory &&
    childCategory &&
    SPATIAL_CATEGORY_DEFINITIONS[parentCategory].allowedChildren.includes(
      childCategory,
    ),
  );
}

/** True when a category can occur anywhere below a root along valid graph edges. */
export function canContainLocationWithinHierarchy(
  ancestor: string | null | undefined,
  descendant: string | null | undefined,
): boolean {
  const ancestorCategory = normalizeLocationCategory(ancestor);
  const descendantCategory = normalizeLocationCategory(descendant);
  if (!ancestorCategory || !descendantCategory) return false;
  const visited = new Set<SpatialLocationCategory>();
  const pending = [
    ...SPATIAL_CATEGORY_DEFINITIONS[ancestorCategory].allowedChildren,
  ];
  while (pending.length > 0) {
    const category = pending.shift()!;
    if (category === descendantCategory) return true;
    if (visited.has(category)) continue;
    visited.add(category);
    pending.push(...SPATIAL_CATEGORY_DEFINITIONS[category].allowedChildren);
  }
  return false;
}

export function resolveContainingCategories(
  child: string | null | undefined,
): SpatialLocationCategory[] {
  const childCategory = normalizeLocationCategory(child);
  if (!childCategory) return [];
  return SPATIAL_LOCATION_CATEGORIES.filter((parent) =>
    SPATIAL_CATEGORY_DEFINITIONS[parent].allowedChildren.includes(
      childCategory,
    ),
  );
}

export function resolveBuilderRootCategories(
  preset?: string | null,
): SpatialLocationCategory[] {
  const categories = SPATIAL_LOCATION_CATEGORIES.filter((category) => {
    const { classification, root } = SPATIAL_CATEGORY_DEFINITIONS[category];
    return classification === "physical" && root === "yes";
  });
  if (!preset) return categories;
  const definition =
    BUILDER_PRESET_DEFINITIONS[preset as ParametricTemplateType];
  return definition ? [definition.rootCategory] : [];
}

export interface SpatialModelInstance {
  readonly locationId: string;
  readonly category: SpatialLocationCategory;
  readonly modelId: string;
  readonly dimensions: Readonly<Dimensions3D>;
}

export type SpatialModelInstanceResult =
  | { valid: true; instance: SpatialModelInstance }
  | { valid: false; errors: string[] };

/** Builds a location-scoped instance; canonical definitions are never mutated. */
export function createSpatialModelInstance(
  locationId: string,
  categoryValue: string,
  dimensions: Dimensions3D,
): SpatialModelInstanceResult {
  const category = normalizeLocationCategory(categoryValue);
  const errors: string[] = [];
  if (!locationId.trim()) errors.push("A location id is required.");
  if (!category || !SPATIAL_CATEGORY_DEFINITIONS[category].modelId)
    errors.push("A physical location category is required.");
  if (
    ![dimensions.widthMm, dimensions.heightMm, dimensions.depthMm].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    errors.push(
      "Model instance width, height, and depth must be finite and positive.",
    );
  }
  if (errors.length || !category) return { valid: false, errors };
  return {
    valid: true,
    instance: Object.freeze({
      locationId,
      category,
      modelId: SPATIAL_CATEGORY_DEFINITIONS[category].modelId!,
      dimensions: Object.freeze({ ...dimensions }),
    }),
  };
}

export interface SpatialEnvelope {
  physical: Dimensions3D;
  clearInterior: Dimensions3D;
}

export function createSpatialEnvelope(
  physical: Dimensions3D,
  clearInterior: Dimensions3D,
): SpatialEnvelope | null {
  const dimensionsArePositive = (value: Dimensions3D) =>
    [value.widthMm, value.heightMm, value.depthMm].every(
      (n) => Number.isFinite(n) && n > 0,
    );
  if (!dimensionsArePositive(physical) || !dimensionsArePositive(clearInterior))
    return null;
  if (
    clearInterior.widthMm > physical.widthMm ||
    clearInterior.heightMm > physical.heightMm ||
    clearInterior.depthMm > physical.depthMm
  )
    return null;
  return { physical: { ...physical }, clearInterior: { ...clearInterior } };
}

export interface ContainmentLayoutItem {
  category: SpatialLocationCategory;
  dimensions: Dimensions3D;
  position: Position3D;
}

export interface ContainmentLayoutIssue {
  code: "DIMENSIONS" | "CONTAINMENT" | "OVERLAP" | "GROUND";
  itemIndex: number;
  message: string;
}

export interface ContainmentGridConfig {
  childCategory: SpatialLocationCategory;
  childDimensions: Dimensions3D;
  rows: number;
  columns: number;
  spacingMm: number;
  clearanceMm?: number;
}

export interface ContainmentGridResult {
  items: ContainmentLayoutItem[];
  issues: ContainmentLayoutIssue[];
}

/** Places equal child instances in a centered X/Z grid on the clear-interior floor. */
export function generateContainmentGrid(
  parentCategory: string,
  clearInterior: Dimensions3D,
  config: ContainmentGridConfig,
): ContainmentGridResult {
  const { rows, columns, spacingMm } = config;
  if (
    !Number.isInteger(rows) ||
    rows < 1 ||
    !Number.isInteger(columns) ||
    columns < 1 ||
    !Number.isFinite(spacingMm) ||
    spacingMm < 0
  ) {
    return {
      items: [],
      issues: [
        {
          code: "DIMENSIONS",
          itemIndex: -1,
          message:
            "Grid rows and columns must be positive integers and spacing must be non-negative.",
        },
      ],
    };
  }
  const startX =
    -((columns - 1) * (config.childDimensions.widthMm + spacingMm)) / 2;
  const startZ =
    -((rows - 1) * (config.childDimensions.depthMm + spacingMm)) / 2;
  const items = Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      category: config.childCategory,
      dimensions: { ...config.childDimensions },
      position: {
        x: startX + column * (config.childDimensions.widthMm + spacingMm),
        y: config.childDimensions.heightMm / 2,
        z: startZ + row * (config.childDimensions.depthMm + spacingMm),
      },
    };
  });
  return {
    items,
    issues: validateContainmentLayout(
      parentCategory,
      clearInterior,
      items,
      config.clearanceMm ?? 0,
    ),
  };
}

export function validateContainmentLayout(
  parentCategory: string,
  clearInterior: Dimensions3D,
  children: readonly ContainmentLayoutItem[],
  clearanceMm = 0,
): ContainmentLayoutIssue[] {
  const issues: ContainmentLayoutIssue[] = [];
  const positive = (d: Dimensions3D) =>
    [d.widthMm, d.heightMm, d.depthMm].every(
      (v) => Number.isFinite(v) && v > 0,
    );
  if (!positive(clearInterior))
    issues.push({
      code: "DIMENSIONS",
      itemIndex: -1,
      message: "Clear interior dimensions must be finite and positive.",
    });
  children.forEach((child, itemIndex) => {
    if (!positive(child.dimensions)) {
      issues.push({
        code: "DIMENSIONS",
        itemIndex,
        message: "Child dimensions must be finite and positive.",
      });
      return;
    }
    if (!canContainLocation(parentCategory, child.category))
      issues.push({
        code: "CONTAINMENT",
        itemIndex,
        message: `${parentCategory} cannot contain ${child.category}.`,
      });
    const half = {
      x: child.dimensions.widthMm / 2,
      y: child.dimensions.heightMm / 2,
      z: child.dimensions.depthMm / 2,
    };
    if (child.position.y - half.y < 0)
      issues.push({
        code: "GROUND",
        itemIndex,
        message:
          "Child geometry extends below the clear-interior ground plane.",
      });
    if (
      Math.abs(child.position.x) + half.x + clearanceMm >
        clearInterior.widthMm / 2 ||
      child.position.y + half.y + clearanceMm > clearInterior.heightMm ||
      Math.abs(child.position.z) + half.z + clearanceMm >
        clearInterior.depthMm / 2
    ) {
      issues.push({
        code: "CONTAINMENT",
        itemIndex,
        message:
          "Child geometry exceeds the parent clear interior or required clearance.",
      });
    }
    children.slice(itemIndex + 1).forEach((other, offset) => {
      const otherHalf = {
        x: other.dimensions.widthMm / 2,
        y: other.dimensions.heightMm / 2,
        z: other.dimensions.depthMm / 2,
      };
      const overlaps =
        Math.abs(child.position.x - other.position.x) <
          half.x + otherHalf.x + clearanceMm &&
        Math.abs(child.position.y - other.position.y) <
          half.y + otherHalf.y + clearanceMm &&
        Math.abs(child.position.z - other.position.z) <
          half.z + otherHalf.z + clearanceMm;
      if (overlaps)
        issues.push({
          code: "OVERLAP",
          itemIndex: itemIndex + offset + 1,
          message: `Child geometry overlaps item ${itemIndex}.`,
        });
    });
  });
  return issues;
}
