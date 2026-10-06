export type ParametricTemplateType =
  | "SMD_DRAWER_CABINET"
  | "OPEN_BIN_MATRIX"
  | "PALLET_RACK"
  | "GRID_PARTS_TRAY"
  | "REEL_RACK"
  | "DRY_CABINET";

/** Stable ordering used by Builder template pickers and persisted-config tooling. */
export const PARAMETRIC_TEMPLATE_TYPES: readonly ParametricTemplateType[] = [
  "SMD_DRAWER_CABINET",
  "OPEN_BIN_MATRIX",
  "PALLET_RACK",
  "GRID_PARTS_TRAY",
  "REEL_RACK",
  "DRY_CABINET",
];

export type CompartmentKind = "drawer" | "bin" | "shelf" | "slot" | "reel_slot" | "matrix_tray" | "compartment";

export interface Dimensions3D {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export interface Position3D {
  x: number; // mm
  y: number; // mm
  z: number; // mm
}

export interface Rotation3D {
  x: number; // degrees
  y: number; // degrees
  z: number; // degrees
}

export type NamingPattern =
  | "ROW_COL_ALPHA_NUM"   // e.g. A01, A02, B01
  | "ROW_COL_NUMERIC"     // e.g. R1-C1, R1-C2, R2-C1
  | "TIER_BIN_NUMERIC"    // e.g. T1-B01, T1-B02
  | "LEVEL_BAY_NUMERIC"   // e.g. L1-B1, L1-B2
  | "SEQUENTIAL";         // e.g. 01, 02, 03...

export interface NamingConfig {
  pattern: NamingPattern;
  prefix?: string;         // e.g. "D-" or "BIN-" or "SHELF-"
  rowLetters?: string[];   // default ["A", "B", "C", ...]
  padDigits?: number;      // default 2 (e.g. 01, 02)
  rowOrder?: "top_to_bottom" | "bottom_to_top"; // default "top_to_bottom"
}

export interface BaseParametricConfig {
  templateType: ParametricTemplateType;
  dimensions: Dimensions3D;
  wallThicknessMm: number; // frame / perimeter wall thickness
  naming?: Partial<NamingConfig>;
}

export interface SmdDrawerCabinetConfig extends BaseParametricConfig {
  templateType: "SMD_DRAWER_CABINET";
  rows: number;
  columns: number;
  dividerThicknessMm?: number; // horizontal and vertical divider thickness
}

export interface OpenBinMatrixConfig extends BaseParametricConfig {
  templateType: "OPEN_BIN_MATRIX";
  tiers: number;            // vertical tiers
  binsPerTier: number;      // horizontal bins per tier
  tierSpacingMm?: number;   // vertical gap between tiers
  binSpacingMm?: number;    // horizontal gap between bins
  binLipHeightRatio?: number; // height ratio for scoop front lip
}

export interface PalletRackConfig extends BaseParametricConfig {
  templateType: "PALLET_RACK";
  levels: number;           // horizontal beam levels
  baysPerLevel: number;     // bay subdivisions per level
  uprightPostWidthMm?: number; // width of corner structural posts
  beamHeightMm?: number;    // height of horizontal load beams
}

export interface GridPartsTrayConfig extends BaseParametricConfig {
  templateType: "GRID_PARTS_TRAY";
  rows: number;
  columns: number;
  dividerThicknessMm?: number;
}

export interface ReelRackConfig extends BaseParametricConfig {
  templateType: "REEL_RACK";
  rows: number;
  columns: number;
  slotSpacingMm?: number;
  uprightWidthMm?: number;
  crossbarHeightMm?: number;
}

export interface DryCabinetConfig extends BaseParametricConfig {
  templateType: "DRY_CABINET";
  rows: number;
  columns: number;
  childCategory: "drawer" | "shelf" | "matrix_tray";
  childSpacingMm?: number;
}

export type ParametricStorageConfig =
  | SmdDrawerCabinetConfig
  | OpenBinMatrixConfig
  | PalletRackConfig
  | GridPartsTrayConfig
  | ReelRackConfig
  | DryCabinetConfig;

export interface GeneratedCompartment {
  /** Stable topological identity, e.g. "drawer_slot_r0_c0" or "rack_bay_r0_c0" */
  slotId: string;
  /** Addressable code conforming to naming pattern, e.g. "A01", "L1-B1" */
  code: string;
  /** Human-readable display label, e.g. "Drawer A01", "Bin A01" */
  name: string;
  /** Compartment storage kind */
  kind: CompartmentKind;
  /** Zero-based logical coordinates */
  logicalIndex: {
    row: number;
    col: number;
  };
  /** Center of compartment relative to container corner (in mm) */
  position: Position3D;
  /** Compartment Euler rotation (in degrees) */
  rotation: Rotation3D;
  /**
   * Physical outer bounding envelope of the compartment slot (in mm).
   * Used for collision detection, visual spacing, and Three.js bounding wireframes.
   */
  dimensions: Dimensions3D;
  /**
   * Internal clear free space available for storing components (in mm).
   * Excludes drawer carcass walls, front pull plates, or bin lips.
   * For pallet racks, equals the clear opening dimensions between structural posts.
   */
  clearDimensions: Dimensions3D;
  /** Metadata record for persistence or rendering hints */
  metadata: {
    templateType: ParametricTemplateType;
    origin: "corner";
    row: number;
    col: number;
    [key: string]: unknown;
  };
}

export interface GeneratedStorageResult {
  templateType: ParametricTemplateType;
  outerDimensions: Dimensions3D;
  usableDimensions: Dimensions3D;
  compartments: GeneratedCompartment[];
  totalCompartments: number;
  config: ParametricStorageConfig;
}

export interface ParametricValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ParametricCompartmentDiff {
  retained: GeneratedCompartment[];
  added: GeneratedCompartment[];
  removed: GeneratedCompartment[];
  modified: Array<{
    previous: GeneratedCompartment;
    current: GeneratedCompartment;
  }>;
  hasChanges: boolean;
  /**
   * Indicates whether the diff represents a structural topological modification
   * (compartments added/removed, template type changed, or topological meaning/ordering changed)
   * versus a purely dimensional resize where 100% of compartments were retained with stable identity.
   */
  isStructuralChange: boolean;
  /**
   * Compartments whose slotId was retained, but whose physical meaning, code, or topological position
   * has changed (e.g. reversing rowOrder from top_to_bottom to bottom_to_top, or code reassignment).
   */
  meaningChangedSlots: Array<{
    previous: GeneratedCompartment;
    current: GeneratedCompartment;
    reason: string;
  }>;
}
