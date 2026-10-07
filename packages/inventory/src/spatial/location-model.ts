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

/**
 * The context ("space") categories that may own physical equipment.
 *
 * A *context root* is not a physical container: it has no carcass and no
 * `allowedChildren` in the direct containment graph, yet in the product a
 * warehouse / room / aisle legitimately roots physical equipment (cabinets,
 * racks, shelves) that compose into a scene. This predicate states that
 * relation explicitly so a rule can answer "may this space own physical
 * equipment?" without hard-coded `kind === "warehouse"` checks.
 *
 * It is deliberately separate from `allowedChildren` and `canContainLocation`:
 * adding physical categories to `allowedChildren` would change containment
 * verdicts, and this predicate must not. It is descriptive infrastructure only.
 */
export const CONTEXT_ROOT_CATEGORIES: ReadonlySet<SpatialLocationCategory> =
  new Set<SpatialLocationCategory>(["warehouse", "room_area", "aisle"]);

/**
 * True when a context/space category may root physical equipment for spatial
 * composition. Accepts canonical categories and legacy aliases (`room`, `area`).
 */
export function isContextRootCategory(
  category: string | null | undefined,
): boolean {
  const resolved = normalizeLocationCategory(category);
  return resolved !== null && CONTEXT_ROOT_CATEGORIES.has(resolved);
}

/** Alias for {@link isContextRootCategory} — the ownership question reads better at call sites. */
export function canRootPhysicalEquipment(
  category: string | null | undefined,
): boolean {
  return isContextRootCategory(category);
}

/**
 * True when a category is a canonical physical ROOT: a physical category that
 * may stand alone and own its own child structure.
 *
 * Derived from the canonical taxonomy (`classification === "physical"` and
 * `root === "yes"`), never from a hard-coded list. A `compartment` or
 * `reel_slot` is physical but `root: "conditional"`, so it is NOT a physical
 * root; a `rack` / `cabinet` / `bin` / `matrix_tray` is.
 */
export function isPhysicalRootCategory(
  category: string | null | undefined,
): boolean {
  const resolved = normalizeLocationCategory(category);
  if (resolved === null) return false;
  const definition = SPATIAL_CATEGORY_DEFINITIONS[resolved];
  return definition.classification === "physical" && definition.root === "yes";
}

export type PhysicalContainmentIssue =
  | "PARENT_UNKNOWN"
  | "CHILD_UNKNOWN"
  | "NOT_PHYSICAL_CONTAINER"
  | "NOT_PHYSICAL_ROOT"
  | "CONTEXT_CHILD_NOT_ROOT";

/**
 * Explains why `parent` may NOT physically contain `child`, or `null` when it may.
 *
 * Returns a stable machine code plus a human-readable reason so the write
 * boundary can raise a precise domain error without re-deriving the rule.
 */
export function explainPhysicalContainmentRejection(
  parent: string | null | undefined,
  child: string | null | undefined,
): { code: PhysicalContainmentIssue; reason: string } | null {
  if (canBePhysicalContainer(parent, child)) return null;

  const parentCategory = normalizeLocationCategory(parent);
  const childCategory = normalizeLocationCategory(child);

  if (parentCategory === null) {
    return {
      code: "PARENT_UNKNOWN",
      reason: `Container kind '${parent ?? ""}' is not a canonical location category.`,
    };
  }
  if (childCategory === null) {
    return {
      code: "CHILD_UNKNOWN",
      reason: `Location kind '${child ?? ""}' is not a canonical location category.`,
    };
  }

  // A context root may own context roots and physical ROOT categories only.
  if (isContextRootCategory(parentCategory)) {
    return {
      code: "NOT_PHYSICAL_ROOT",
      reason: `'${parentCategory}' is a space and can physically contain only physical root categories (rack, cabinet, shelf, bin, drawer, dry_cabinet, reel_rack, matrix_tray) or another space — not '${childCategory}'.`,
    };
  }

  const parentDefinition = SPATIAL_CATEGORY_DEFINITIONS[parentCategory];
  if (parentDefinition.classification !== "physical") {
    // Unreachable while context roots are the only context categories, but kept
    // so a future context category cannot slip through.
    return {
      code: "NOT_PHYSICAL_CONTAINER",
      reason: `'${parentCategory}' is not a physical container and cannot contain '${childCategory}'.`,
    };
  }

  if (isContextRootCategory(childCategory)) {
    return {
      code: "CONTEXT_CHILD_NOT_ROOT",
      reason: `'${parentCategory}' cannot physically contain the space '${childCategory}'.`,
    };
  }

  return {
    code: "NOT_PHYSICAL_ROOT",
    reason: `'${parentCategory}' cannot physically contain '${childCategory}': a physical container may contain only its canonical direct child categories.`,
  };
}

/**
 * THE canonical authority for physical containment (RFC-0069, Phase 2).
 *
 * Determines whether the location with kind `parent` may PHYSICALLY contain the
 * location with kind `child`. This is the single rule the `containerId` write
 * boundary uses; no consumer may re-implement it or add a parallel matrix.
 *
 *   canBePhysicalContainer(parent, child) =
 *       canContainLocation(parent, child)                     # canonical direct edge
 *    OR ( isContextRootCategory(parent)                      # a space owning equipment
 *         AND ( isContextRootCategory(child)                 # a space inside a space
 *            OR isPhysicalRootCategory(child) ) )            # equipment / structure
 *
 * `SPATIAL_CATEGORY_DEFINITIONS[*].allowedChildren` remains the authority for
 * canonical direct physical child compatibility; context-root ownership is the
 * separate second clause and is deliberately NOT added to `allowedChildren`.
 */
export function canBePhysicalContainer(
  parent: string | null | undefined,
  child: string | null | undefined,
): boolean {
  if (canContainLocation(parent, child)) return true;
  if (!isContextRootCategory(parent)) return false;
  return isContextRootCategory(child) || isPhysicalRootCategory(child);
}

/**
 * Documented legacy parent → child kind pairs.
 *
 * These relationships are not derivable from the canonical graph but are known,
 * intentional legacy compatibility patterns. They are listed explicitly (rather
 * than folded into `allowedChildren`) so a read-only audit can distinguish a
 * *known* legacy relationship from a genuinely unexpected one, without changing
 * any containment verdict.
 *
 * `matrix_tray → bin`: the archived `GRID_PARTS_TRAY` layout recorded its tray
 * cells as `bin` locations, so bins nested under a legacy tray are expected.
 */
const LEGACY_COMPATIBLE_HIERARCHY_PAIRS: ReadonlyArray<
  readonly [SpatialLocationCategory, SpatialLocationCategory]
> = [["matrix_tray", "bin"]];

export type LocationHierarchyRelationshipKind =
  | "canonical"
  | "context-root"
  | "legacy-compatible"
  | "violation";

export interface LocationHierarchyRelationshipClassification {
  /** True when the child category is a canonical direct child of the parent. */
  canonical: boolean;
  /** True when the parent is a context root that may own physical equipment. */
  contextRoot: boolean;
  /** True for a documented legacy compatibility pair. */
  legacyCompatible: boolean;
  /** True when none of the above holds. */
  violation: boolean;
  kind: LocationHierarchyRelationshipKind;
  /** Human-readable reason, always populated for a violation. */
  reason: string | null;
  parentCategory: SpatialLocationCategory | null;
  childCategory: SpatialLocationCategory | null;
}

/**
 * Classifies a `parent.kind` / `child.kind` pair for the read-only hierarchy
 * audit. This never mutates anything and never changes a containment verdict —
 * it only *describes* whether a persisted relationship is canonical, a
 * context-root relationship, a documented legacy pattern, or a violation.
 *
 * A relationship is a violation only when the parent resolves to a *physical*
 * category and none of the three accepted reasons apply. When either side is
 * unresolved the relationship is reported as a violation with an explicit
 * reason, so nothing is silently skipped.
 */
export function classifyLocationHierarchyRelationship(
  parentKind: string | null | undefined,
  childKind: string | null | undefined,
): LocationHierarchyRelationshipClassification {
  const parentCategory = normalizeLocationCategory(parentKind);
  const childCategory = normalizeLocationCategory(childKind);

  const canonical =
    parentCategory !== null &&
    childCategory !== null &&
    SPATIAL_CATEGORY_DEFINITIONS[parentCategory].allowedChildren.includes(
      childCategory,
    );

  const contextRoot = isContextRootCategory(parentCategory);

  const legacyCompatible =
    parentCategory !== null &&
    childCategory !== null &&
    LEGACY_COMPATIBLE_HIERARCHY_PAIRS.some(
      ([parent, child]) => parent === parentCategory && child === childCategory,
    );

  let kind: LocationHierarchyRelationshipKind;
  let reason: string | null = null;

  if (canonical) {
    kind = "canonical";
  } else if (contextRoot) {
    kind = "context-root";
  } else if (legacyCompatible) {
    kind = "legacy-compatible";
  } else {
    kind = "violation";
    if (parentCategory === null) {
      reason = `Parent kind '${parentKind ?? ""}' is not a canonical category.`;
    } else if (childCategory === null) {
      reason = `Child kind '${childKind ?? ""}' is not a canonical category.`;
    } else if (SPATIAL_CATEGORY_DEFINITIONS[parentCategory].classification === "context") {
      // A non-context context category (none today) — kept for completeness.
      reason = `Context category '${parentCategory}' may not own '${childCategory}'.`;
    } else {
      reason = `'${parentCategory}' is not a canonical parent of '${childCategory}'${isContextRootCategory(childCategory) ? " (a context category cannot be a child)" : ""}.`;
    }
  }

  return {
    canonical,
    contextRoot,
    legacyCompatible,
    violation: kind === "violation",
    kind,
    reason,
    parentCategory,
    childCategory,
  };
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
