import {
  InvalidParametricDimensionError,
  InvalidParametricSubdivisionError,
  ParametricGeometryOutOfBoundsError,
  ParametricGeometryOverlapError,
} from "./parametric-storage.errors";
import { canContainLocation } from "../location-model";
import type {
  Dimensions3D,
  GeneratedCompartment,
  GeneratedStorageResult,
  GridPartsTrayConfig,
  NamingConfig,
  OpenBinMatrixConfig,
  PalletRackConfig,
  ParametricCompartmentDiff,
  ParametricStorageConfig,
  ParametricValidationResult,
  ReelRackConfig,
  DryCabinetConfig,
  SmdDrawerCabinetConfig,
} from "./parametric-template.types";

const DEFAULT_ROW_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
  "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T",
  "U", "V", "W", "X", "Y", "Z",
];

/**
 * Geometric tolerance in millimeters (15 micrometers / 0.015 mm).
 * Accommodates IEEE 754 floating-point precision and 2-decimal rounding (0.01 mm)
 * when subdividing dimensions into fractional millimeters (e.g. 100mm / 6 columns = 16.666...mm).
 * Ensures exact face-touching boundaries (0mm gap) are never falsely flagged as overlaps,
 * while strictly catching genuine intersections representable in stored precision (>= 0.02 mm).
 *
 * Precision Policy:
 * - Stored coordinates and dimensions are quantized to 0.01 mm (10 microns).
 * - Maximum rounding artifact when subdividing repeating fractions is bounded by ~0.0100000000001 mm.
 * - Sub-tolerance intersections (< 0.01 mm) are mathematically unrepresentable at 2-decimal resolution.
 * - Any physical overlap >= 0.02 mm (e.g. 20 microns) is strictly detected and rejected.
 */
export const GEOMETRY_TOLERANCE_MM = 0.015;

/**
 * Validates a parametric storage configuration against physical feasibility rules.
 */
export function validateParametricConfig(
  config: ParametricStorageConfig,
): ParametricValidationResult {
  const errors: string[] = [];

  // 1. Dimensions validation (must be positive, finite numbers)
  const { widthMm, heightMm, depthMm } = config.dimensions;
  if (typeof widthMm !== "number" || !Number.isFinite(widthMm) || widthMm <= 0) {
    errors.push("Width must be a positive finite number.");
  }
  if (typeof heightMm !== "number" || !Number.isFinite(heightMm) || heightMm <= 0) {
    errors.push("Height must be a positive finite number.");
  }
  if (typeof depthMm !== "number" || !Number.isFinite(depthMm) || depthMm <= 0) {
    errors.push("Depth must be a positive finite number.");
  }

  // 2. Wall thickness validation
  if (
    typeof config.wallThicknessMm !== "number" ||
    !Number.isFinite(config.wallThicknessMm) ||
    config.wallThicknessMm < 0
  ) {
    errors.push("Wall thickness must be a non-negative finite number.");
  } else {
    if (config.wallThicknessMm * 2 >= widthMm) {
      errors.push(
        `Perimeter walls (${config.wallThicknessMm * 2}mm total) exceed or equal outer width (${widthMm}mm).`,
      );
    }
    if (config.wallThicknessMm * 2 >= heightMm) {
      errors.push(
        `Perimeter walls (${config.wallThicknessMm * 2}mm total) exceed or equal outer height (${heightMm}mm).`,
      );
    }
    const isTray = config.templateType === "GRID_PARTS_TRAY";
    const requiredDepthWalls = isTray ? config.wallThicknessMm * 2 : config.wallThicknessMm;
    if (requiredDepthWalls >= depthMm) {
      errors.push(
        `Perimeter wall (${requiredDepthWalls}mm) exceeds or equals outer depth (${depthMm}mm).`,
      );
    }
  }

  // 3. Template-specific subdivision validation
  switch (config.templateType) {
    case "SMD_DRAWER_CABINET": {
      validateGridSubdivisions(config, errors);
      break;
    }
    case "OPEN_BIN_MATRIX": {
      validateBinMatrixSubdivisions(config, errors);
      break;
    }
    case "PALLET_RACK": {
      validatePalletRackSubdivisions(config, errors);
      break;
    }
    case "GRID_PARTS_TRAY": {
      validateGridSubdivisions(config, errors);
      break;
    }
    case "REEL_RACK": {
      validateReelRackSubdivisions(config, errors);
      break;
    }
    case "DRY_CABINET": {
      validateDryCabinetSubdivisions(config, errors);
      break;
    }
    default: {
      errors.push(`Unknown template type: ${(config as { templateType: string }).templateType}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function validateDryCabinetSubdivisions(config: DryCabinetConfig, errors: string[]): void {
  for (const [label, value] of [["Row count", config.rows], ["Column count", config.columns]] as const) {
    if (!Number.isInteger(value) || value < 1) errors.push(`${label} must be an integer >= 1.`);
  }
  if (!["drawer", "shelf", "matrix_tray"].includes(config.childCategory)) errors.push("Dry Cabinet child category is not allowed.");
  if (!canContainLocation("dry_cabinet", config.childCategory)) errors.push("Dry Cabinet child category is not allowed by the canonical containment graph.");
  const spacing = config.childSpacingMm ?? 12;
  if (!Number.isFinite(spacing) || spacing < 0) errors.push("Dry Cabinet child spacing must be a non-negative finite number.");
  if (2 * config.wallThicknessMm >= config.dimensions.widthMm || 2 * config.wallThicknessMm >= config.dimensions.depthMm || 2 * config.wallThicknessMm >= config.dimensions.heightMm) errors.push("Dry Cabinet clear interior must remain positive after wall allowances.");
  if (config.columns * 1 > 0 && config.dimensions.widthMm - 2 * config.wallThicknessMm - (config.columns - 1) * spacing <= 0) errors.push("Dry Cabinet child columns exceed the clear width.");
  if (config.rows * 1 > 0 && config.dimensions.heightMm - 2 * config.wallThicknessMm - (config.rows - 1) * spacing <= 0) errors.push("Dry Cabinet child rows exceed the clear height.");
}

function validateReelRackSubdivisions(config: ReelRackConfig, errors: string[]): void {
  for (const [label, value] of [["Row count", config.rows], ["Column count", config.columns]] as const) {
    if (!Number.isInteger(value) || value < 1) errors.push(`${label} must be an integer >= 1.`);
  }
  const spacing = config.slotSpacingMm ?? 12;
  const upright = config.uprightWidthMm ?? 35;
  const crossbar = config.crossbarHeightMm ?? 25;
  if (![spacing, upright, crossbar].every((value) => Number.isFinite(value) && value >= 0)) {
    errors.push("Reel rack spacing and structural dimensions must be non-negative finite numbers.");
    return;
  }
  if (config.dimensions.widthMm - (config.columns + 1) * upright - (config.columns - 1) * spacing <= 0) {
    errors.push("Reel slot columns exceed the clear width between rack uprights.");
  }
  if (config.dimensions.heightMm - (config.rows + 1) * crossbar - (config.rows - 1) * spacing <= 0) {
    errors.push("Reel slot rows exceed the clear height between rack crossbars.");
  }
  if (config.dimensions.depthMm <= upright * 2) {
    errors.push("Reel rack depth must exceed the front and rear upright clearance.");
  }
}

function validateGridSubdivisions(
  config: SmdDrawerCabinetConfig | GridPartsTrayConfig,
  errors: string[],
): void {
  if (
    typeof config.rows !== "number" ||
    !Number.isInteger(config.rows) ||
    config.rows < 1
  ) {
    errors.push("Row count must be an integer >= 1.");
  }
  if (
    typeof config.columns !== "number" ||
    !Number.isInteger(config.columns) ||
    config.columns < 1
  ) {
    errors.push("Column count must be an integer >= 1.");
  }

  const isTray = config.templateType === "GRID_PARTS_TRAY";
  const divider = config.dividerThicknessMm ?? (isTray ? 2 : 3);
  if (typeof divider !== "number" || !Number.isFinite(divider) || divider < 0) {
    errors.push("Divider thickness must be a non-negative finite number.");
  }

  if (errors.length === 0) {
    const usableW =
      config.dimensions.widthMm -
      config.wallThicknessMm * 2 -
      (config.columns - 1) * divider;
    const usableRows = isTray
      ? config.dimensions.depthMm - config.wallThicknessMm - (config.rows - 1) * divider
      : config.dimensions.heightMm - config.wallThicknessMm * 2 - (config.rows - 1) * divider;

    if (usableW <= 0) {
      errors.push(
        `Configured columns (${config.columns}) and dividers (${divider}mm) exceed available internal width.`,
      );
    }
    if (usableRows <= 0) {
      errors.push(
        isTray
          ? `Configured rows (${config.rows}) and dividers (${divider}mm) exceed available internal depth.`
          : `Configured rows (${config.rows}) and dividers (${divider}mm) exceed available internal height.`,
      );
    }
    if (isTray && config.dimensions.heightMm - config.wallThicknessMm <= 0) {
      errors.push("Matrix Tray clear height must remain positive above its base.");
    }
  }
}

function validateBinMatrixSubdivisions(
  config: OpenBinMatrixConfig,
  errors: string[],
): void {
  if (
    typeof config.tiers !== "number" ||
    !Number.isInteger(config.tiers) ||
    config.tiers < 1
  ) {
    errors.push("Tier count must be an integer >= 1.");
  }
  if (
    typeof config.binsPerTier !== "number" ||
    !Number.isInteger(config.binsPerTier) ||
    config.binsPerTier < 1
  ) {
    errors.push("Bins per tier must be an integer >= 1.");
  }

  const tierSpacing = config.tierSpacingMm ?? 10;
  const binSpacing = config.binSpacingMm ?? 6;

  if (typeof tierSpacing !== "number" || !Number.isFinite(tierSpacing) || tierSpacing < 0) {
    errors.push("Tier spacing must be a non-negative finite number.");
  }
  if (typeof binSpacing !== "number" || !Number.isFinite(binSpacing) || binSpacing < 0) {
    errors.push("Bin spacing must be a non-negative finite number.");
  }

  if (errors.length === 0) {
    const usableW =
      config.dimensions.widthMm -
      config.wallThicknessMm * 2 -
      (config.binsPerTier - 1) * binSpacing;
    const usableH =
      config.dimensions.heightMm -
      config.wallThicknessMm * 2 -
      (config.tiers - 1) * tierSpacing;

    if (usableW <= 0) {
      errors.push(
        `Configured bins per tier (${config.binsPerTier}) and spacing (${binSpacing}mm) exceed available width.`,
      );
    }
    if (usableH <= 0) {
      errors.push(
        `Configured tiers (${config.tiers}) and spacing (${tierSpacing}mm) exceed available height.`,
      );
    }
  }
}

function validatePalletRackSubdivisions(
  config: PalletRackConfig,
  errors: string[],
): void {
  if (
    typeof config.levels !== "number" ||
    !Number.isInteger(config.levels) ||
    config.levels < 1
  ) {
    errors.push("Level count must be an integer >= 1.");
  }
  if (
    typeof config.baysPerLevel !== "number" ||
    !Number.isInteger(config.baysPerLevel) ||
    config.baysPerLevel < 1
  ) {
    errors.push("Bays per level must be an integer >= 1.");
  }

  const postWidth = config.uprightPostWidthMm ?? (config.wallThicknessMm > 0 ? config.wallThicknessMm : 50);
  const beamHeight = config.beamHeightMm ?? 40;

  if (typeof postWidth !== "number" || !Number.isFinite(postWidth) || postWidth < 0) {
    errors.push("Upright post width must be a non-negative finite number.");
  }
  if (typeof beamHeight !== "number" || !Number.isFinite(beamHeight) || beamHeight < 0) {
    errors.push("Beam height must be a non-negative finite number.");
  }

  if (errors.length === 0) {
    const totalPostsWidth =
      2 * postWidth + (config.baysPerLevel - 1) * postWidth;
    const totalBeamsHeight = (config.levels + 1) * beamHeight;

    if (config.dimensions.widthMm <= totalPostsWidth) {
      errors.push(
        `Structural posts (${totalPostsWidth}mm total) exceed or equal outer rack width (${config.dimensions.widthMm}mm).`,
      );
    }
    if (config.dimensions.heightMm <= totalBeamsHeight) {
      errors.push(
        `Structural load beams (${totalBeamsHeight}mm total) exceed or equal outer rack height (${config.dimensions.heightMm}mm).`,
      );
    }
  }
}

/**
 * Resolves deterministic code and label for a compartment.
 */
function resolveCompartmentIdentity(
  rowIdx: number,
  colIdx: number,
  totalRows: number,
  totalCols: number,
  naming: Partial<NamingConfig> | undefined,
  kind: "drawer" | "bin" | "shelf" | "slot" | "reel_slot" | "matrix_tray" | "compartment",
  slotPrefix: string,
): { code: string; name: string; slotId: string } {
  const pattern = naming?.pattern ?? "ROW_COL_ALPHA_NUM";
  const prefix = naming?.prefix ?? "";
  const padDigits = Math.max(1, Math.min(10, Math.floor(naming?.padDigits ?? 2)));
  const rowLetters = naming?.rowLetters ?? DEFAULT_ROW_LETTERS;

  // Stable slot ID: purely topological (does not change with dimensions)
  const slotId = `${slotPrefix}_r${rowIdx}_c${colIdx}`;

  let codeCore = "";
  switch (pattern) {
    case "ROW_COL_ALPHA_NUM": {
      const rowChar =
        rowLetters[rowIdx] ??
        (rowIdx < 26
          ? String.fromCharCode(65 + rowIdx)
          : `R${rowIdx + 1}`);
      const colStr = String(colIdx + 1).padStart(padDigits, "0");
      codeCore = `${rowChar}${colStr}`;
      break;
    }
    case "ROW_COL_NUMERIC": {
      codeCore = `R${rowIdx + 1}-C${colIdx + 1}`;
      break;
    }
    case "TIER_BIN_NUMERIC": {
      const binStr = String(colIdx + 1).padStart(padDigits, "0");
      codeCore = `T${rowIdx + 1}-B${binStr}`;
      break;
    }
    case "LEVEL_BAY_NUMERIC": {
      codeCore = `L${rowIdx + 1}-B${colIdx + 1}`;
      break;
    }
    case "SEQUENTIAL": {
      const seq = rowIdx * totalCols + colIdx + 1;
      codeCore = String(seq).padStart(padDigits, "0");
      break;
    }
  }

  const code = `${prefix}${codeCore}`;
  const kindLabel =
    kind === "drawer"
      ? "Drawer"
      : kind === "bin"
        ? "Bin"
      : kind === "shelf"
          ? "Shelf"
      : kind === "compartment"
        ? "Compartment"
      : kind === "matrix_tray"
            ? "Matrix Tray"
            : kind === "reel_slot"
            ? "Reel Slot"
          : "Compartment";
  const name = `${kindLabel} ${code}`;

  return { code, name, slotId };
}

/**
 * Generates deterministic physical compartments for a parametric storage configuration.
 *
 * PURE FUNCTION:
 * - Independent of Three.js, React, DOM, database, or network.
 * - Always produces deterministic slot IDs, coordinates, and bounding boxes.
 */
export function generateStorageCompartments(
  config: ParametricStorageConfig,
): GeneratedStorageResult {
  const validation = validateParametricConfig(config);
  if (!validation.isValid) {
    throw new InvalidParametricDimensionError(validation.errors.join("; "));
  }

  const { dimensions, wallThicknessMm, naming } = config;
  const rowOrder = naming?.rowOrder ?? "top_to_bottom";

  const compartments: GeneratedCompartment[] = [];
  let usableW = 0;
  let usableH = 0;
  let usableD = 0;

  switch (config.templateType) {
    case "SMD_DRAWER_CABINET":
    {
      const kind = "drawer";
      const slotPrefix = "drawer_slot";
      const divider = config.dividerThicknessMm ?? 3;

      usableW = dimensions.widthMm - 2 * wallThicknessMm;
      usableH = dimensions.heightMm - 2 * wallThicknessMm;
      usableD = dimensions.depthMm - wallThicknessMm;

      const cellW = (usableW - (config.columns - 1) * divider) / config.columns;
      const cellH = (usableH - (config.rows - 1) * divider) / config.rows;
      const cellD = usableD;

      // Internal clear space (excluding drawer face plate and body wall thickness)
      const clearW = roundMm(Math.max(1, cellW - 4));
      const clearH = roundMm(Math.max(1, cellH - 4));
      const clearD = roundMm(Math.max(1, cellD - 6));

      for (let r = 0; r < config.rows; r++) {
        // Top-to-bottom: r = 0 is highest Y (top row)
        // Bottom-to-top: r = 0 is lowest Y (bottom row)
        const rowFromBottom =
          rowOrder === "top_to_bottom" ? config.rows - 1 - r : r;
        const cy =
          wallThicknessMm +
          rowFromBottom * (cellH + divider) +
          cellH / 2;

        for (let c = 0; c < config.columns; c++) {
          const cx =
            wallThicknessMm +
            c * (cellW + divider) +
            cellW / 2;

          const cz = wallThicknessMm + cellD / 2;

          const { code, name, slotId } = resolveCompartmentIdentity(
            r,
            c,
            config.rows,
            config.columns,
            naming,
            kind,
            slotPrefix,
          );

          compartments.push({
            slotId,
            code,
            name,
            kind,
            logicalIndex: { row: r, col: c },
            position: {
              x: roundMm(cx),
              y: roundMm(cy),
              z: roundMm(cz),
            },
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: {
              widthMm: roundMm(cellW),
              heightMm: roundMm(cellH),
              depthMm: roundMm(cellD),
            },
            clearDimensions: {
              widthMm: clearW,
              heightMm: clearH,
              depthMm: clearD,
            },
            metadata: {
              templateType: config.templateType,
              origin: "corner",
              row: r,
              col: c,
            },
          });
        }
      }
      break;
    }

    case "GRID_PARTS_TRAY": {
      const kind = "compartment";
      const slotPrefix = "tray_compartment";
      const divider = config.dividerThicknessMm ?? 2;
      // Matrix Tray rows run along its depth; columns run across its width.
      // Its clear height is above the base, while its physical top remains open.
      usableW = dimensions.widthMm - 2 * wallThicknessMm;
      usableH = dimensions.heightMm - wallThicknessMm;
      usableD = dimensions.depthMm - wallThicknessMm;
      const cellW = (usableW - (config.columns - 1) * divider) / config.columns;
      const cellD = (usableD - (config.rows - 1) * divider) / config.rows;
      for (let row = 0; row < config.rows; row++) {
        const rowFromBack = rowOrder === "top_to_bottom" ? config.rows - 1 - row : row;
        for (let col = 0; col < config.columns; col++) {
          const { code, name, slotId } = resolveCompartmentIdentity(
            row, col, config.rows, config.columns, naming, kind, slotPrefix,
          );
          compartments.push({
            slotId, code, name, kind, logicalIndex: { row, col },
            position: {
              x: roundMm(wallThicknessMm + col * (cellW + divider) + cellW / 2),
              y: roundMm(wallThicknessMm + usableH / 2),
              z: roundMm(wallThicknessMm + rowFromBack * (cellD + divider) + cellD / 2),
            },
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: { widthMm: roundMm(cellW), heightMm: roundMm(usableH), depthMm: roundMm(cellD) },
            clearDimensions: { widthMm: roundMm(cellW), heightMm: roundMm(usableH), depthMm: roundMm(cellD) },
            metadata: { templateType: config.templateType, origin: "corner", row, col },
          });
        }
      }
      break;
    }

    case "REEL_RACK": {
      const upright = config.uprightWidthMm ?? 35;
      const crossbar = config.crossbarHeightMm ?? 25;
      const spacing = config.slotSpacingMm ?? 12;
      usableW = dimensions.widthMm - (config.columns + 1) * upright - (config.columns - 1) * spacing;
      usableH = dimensions.heightMm - (config.rows + 1) * crossbar - (config.rows - 1) * spacing;
      usableD = dimensions.depthMm - 2 * (config.uprightWidthMm ?? 35);
      const cellW = usableW / config.columns;
      const cellH = usableH / config.rows;
      const slotD = usableD;
      for (let row = 0; row < config.rows; row++) {
        const rowFromBottom = rowOrder === "top_to_bottom" ? config.rows - 1 - row : row;
        for (let col = 0; col < config.columns; col++) {
          const cx = upright + col * (cellW + upright + spacing) + cellW / 2;
          const cy = crossbar + rowFromBottom * (cellH + crossbar + spacing) + cellH / 2;
          const { code, name, slotId } = resolveCompartmentIdentity(
            row, col, config.rows, config.columns, naming ?? { pattern: "ROW_COL_NUMERIC" }, "reel_slot", "reel_slot",
          );
          compartments.push({
            slotId,
            code,
            name,
            kind: "reel_slot",
            logicalIndex: { row, col },
            position: { x: roundMm(cx), y: roundMm(cy), z: roundMm(slotD / 2 + wallThicknessMm / 2) },
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: { widthMm: roundMm(cellW), heightMm: roundMm(cellH), depthMm: roundMm(slotD) },
            clearDimensions: { widthMm: roundMm(cellW), heightMm: roundMm(cellH), depthMm: roundMm(slotD) },
            metadata: { templateType: config.templateType, origin: "corner", row, col },
          });
        }
      }
      break;
    }

    case "DRY_CABINET": {
      const spacing = config.childSpacingMm ?? 12;
      usableW = dimensions.widthMm - 2 * wallThicknessMm;
      usableH = dimensions.heightMm - 2 * wallThicknessMm;
      usableD = dimensions.depthMm - wallThicknessMm;
      const cellW = (usableW - (config.columns - 1) * spacing) / config.columns;
      const cellH = (usableH - (config.rows - 1) * spacing) / config.rows;
      const kind = config.childCategory;
      const slotPrefix = `dry_cabinet_${kind}`;
      for (let row = 0; row < config.rows; row++) {
        const rowFromBottom = rowOrder === "top_to_bottom" ? config.rows - 1 - row : row;
        for (let col = 0; col < config.columns; col++) {
          const { code, name, slotId } = resolveCompartmentIdentity(row, col, config.rows, config.columns, config.naming ?? { pattern: "ROW_COL_ALPHA_NUM" }, kind, slotPrefix);
          compartments.push({
            slotId, code, name, kind, logicalIndex: { row, col },
            position: { x: roundMm(wallThicknessMm + col * (cellW + spacing) + cellW / 2), y: roundMm(wallThicknessMm + rowFromBottom * (cellH + spacing) + cellH / 2), z: roundMm(wallThicknessMm + usableD / 2) },
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: { widthMm: roundMm(cellW), heightMm: roundMm(cellH), depthMm: roundMm(usableD) },
            clearDimensions: { widthMm: roundMm(cellW), heightMm: roundMm(cellH), depthMm: roundMm(usableD) },
            metadata: { templateType: config.templateType, origin: "corner", row, col },
          });
        }
      }
      break;
    }

    case "OPEN_BIN_MATRIX": {
      const tierSpacing = config.tierSpacingMm ?? 10;
      const binSpacing = config.binSpacingMm ?? 6;

      usableW = dimensions.widthMm - 2 * wallThicknessMm;
      usableH = dimensions.heightMm - 2 * wallThicknessMm;
      usableD = dimensions.depthMm - wallThicknessMm;

      const cellW =
        (usableW - (config.binsPerTier - 1) * binSpacing) / config.binsPerTier;
      const cellH =
        (usableH - (config.tiers - 1) * tierSpacing) / config.tiers;
      const cellD = usableD;

      // Internal clear space (excluding bin walls)
      const clearW = roundMm(Math.max(1, cellW - 4));
      const clearH = roundMm(Math.max(1, cellH - 4));
      const clearD = roundMm(Math.max(1, cellD - 4));

      for (let t = 0; t < config.tiers; t++) {
        const tierFromBottom =
          rowOrder === "top_to_bottom" ? config.tiers - 1 - t : t;
        const cy =
          wallThicknessMm +
          tierFromBottom * (cellH + tierSpacing) +
          cellH / 2;

        for (let b = 0; b < config.binsPerTier; b++) {
          const cx =
            wallThicknessMm +
            b * (cellW + binSpacing) +
            cellW / 2;

          const cz = wallThicknessMm + cellD / 2;

          const { code, name, slotId } = resolveCompartmentIdentity(
            t,
            b,
            config.tiers,
            config.binsPerTier,
            naming,
            "bin",
            "bin_slot",
          );

          compartments.push({
            slotId,
            code,
            name,
            kind: "bin",
            logicalIndex: { row: t, col: b },
            position: {
              x: roundMm(cx),
              y: roundMm(cy),
              z: roundMm(cz),
            },
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: {
              widthMm: roundMm(cellW),
              heightMm: roundMm(cellH),
              depthMm: roundMm(cellD),
            },
            clearDimensions: {
              widthMm: clearW,
              heightMm: clearH,
              depthMm: clearD,
            },
            metadata: {
              templateType: config.templateType,
              origin: "corner",
              row: t,
              col: b,
            },
          });
        }
      }
      break;
    }

    case "PALLET_RACK": {
      const postWidth = config.uprightPostWidthMm ?? (config.wallThicknessMm > 0 ? config.wallThicknessMm : 50);
      const beamHeight = config.beamHeightMm ?? 40;

      usableW =
        dimensions.widthMm -
        (2 * postWidth + (config.baysPerLevel - 1) * postWidth);
      usableH =
        dimensions.heightMm -
        (config.levels + 1) * beamHeight;
      usableD = dimensions.depthMm;

      const bayW = usableW / config.baysPerLevel;
      const levelH = usableH / config.levels;
      const bayD = usableD;

      for (let l = 0; l < config.levels; l++) {
        // Pallet racks naturally count levels from ground up (L1 is bottom shelf level)
        // If rowOrder is "top_to_bottom", level 0 is top shelf
        const levelFromBottom =
          rowOrder === "top_to_bottom" ? config.levels - 1 - l : l;
        const cy =
          beamHeight +
          levelFromBottom * (levelH + beamHeight) +
          levelH / 2;

        for (let b = 0; b < config.baysPerLevel; b++) {
          const cx =
            postWidth +
            b * (bayW + postWidth) +
            bayW / 2;

          const cz = bayD / 2;

          const { code, name, slotId } = resolveCompartmentIdentity(
            l,
            b,
            config.levels,
            config.baysPerLevel,
            naming ?? { pattern: "LEVEL_BAY_NUMERIC" },
            "shelf",
            "rack_bay",
          );

          compartments.push({
            slotId,
            code,
            name,
            kind: "shelf",
            logicalIndex: { row: l, col: b },
            position: {
              x: roundMm(cx),
              y: roundMm(cy),
              z: roundMm(cz),
            },
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: {
              widthMm: roundMm(bayW),
              heightMm: roundMm(levelH),
              depthMm: roundMm(bayD),
            },
            clearDimensions: {
              widthMm: roundMm(bayW),
              heightMm: roundMm(levelH),
              depthMm: roundMm(bayD),
            },
            metadata: {
              templateType: config.templateType,
              origin: "corner",
              row: l,
              col: b,
            },
          });
        }
      }
      break;
    }
  }

  // 4. Invariant assertion: Validate physical boundary encapsulation
  assertCompartmentsWithinBounds(compartments, dimensions);

  // 5. Invariant assertion: Validate zero overlaps between distinct compartments
  assertNoCompartmentOverlaps(compartments);

  return {
    templateType: config.templateType,
    outerDimensions: { ...dimensions },
    usableDimensions: {
      widthMm: roundMm(usableW),
      heightMm: roundMm(usableH),
      depthMm: roundMm(usableD),
    },
    compartments,
    totalCompartments: compartments.length,
    config,
  };
}

/**
 * Asserts that all generated compartments fit strictly within outer container bounds.
 * Allows a numerical tolerance of GEOMETRY_TOLERANCE_MM to absorb fractional rounding artifacts.
 */
export function assertCompartmentsWithinBounds(
  compartments: GeneratedCompartment[],
  outerDimensions: Dimensions3D,
  toleranceMm: number = GEOMETRY_TOLERANCE_MM,
): void {
  for (const comp of compartments) {
    const halfW = comp.dimensions.widthMm / 2;
    const halfH = comp.dimensions.heightMm / 2;
    const halfD = comp.dimensions.depthMm / 2;

    const xMin = comp.position.x - halfW;
    const xMax = comp.position.x + halfW;
    const yMin = comp.position.y - halfH;
    const yMax = comp.position.y + halfH;
    const zMin = comp.position.z - halfD;
    const zMax = comp.position.z + halfD;

    if (
      xMin < -toleranceMm ||
      xMax > outerDimensions.widthMm + toleranceMm ||
      yMin < -toleranceMm ||
      yMax > outerDimensions.heightMm + toleranceMm ||
      zMin < -toleranceMm ||
      zMax > outerDimensions.depthMm + toleranceMm
    ) {
      throw new ParametricGeometryOutOfBoundsError(
        `Compartment '${comp.code}' extends outside outer container boundaries: [${roundMm(xMin)}, ${roundMm(xMax)}] x [${roundMm(yMin)}, ${roundMm(yMax)}] x [${roundMm(zMin)}, ${roundMm(zMax)}], outer: ${outerDimensions.widthMm}x${outerDimensions.heightMm}x${outerDimensions.depthMm}`,
      );
    }
  }
}

/**
 * Asserts that no two compartments physically overlap in 3D space.
 * Touching faces (zero clearance) are strictly permitted and not considered overlaps.
 * Applies toleranceMm symmetrically across X, Y, and Z.
 */
export function assertNoCompartmentOverlaps(
  compartments: GeneratedCompartment[],
  toleranceMm: number = GEOMETRY_TOLERANCE_MM,
): void {
  for (let i = 0; i < compartments.length; i++) {
    const a = compartments[i]!;
    const aHalfW = a.dimensions.widthMm / 2;
    const aHalfH = a.dimensions.heightMm / 2;
    const aHalfD = a.dimensions.depthMm / 2;

    for (let j = i + 1; j < compartments.length; j++) {
      const b = compartments[j]!;
      const bHalfW = b.dimensions.widthMm / 2;
      const bHalfH = b.dimensions.heightMm / 2;
      const bHalfD = b.dimensions.depthMm / 2;

      const overlapX =
        Math.abs(a.position.x - b.position.x) < aHalfW + bHalfW - toleranceMm;
      const overlapY =
        Math.abs(a.position.y - b.position.y) < aHalfH + bHalfH - toleranceMm;
      const overlapZ =
        Math.abs(a.position.z - b.position.z) < aHalfD + bHalfD - toleranceMm;

      if (overlapX && overlapY && overlapZ) {
        throw new ParametricGeometryOverlapError(
          `Compartment '${a.code}' and '${b.code}' overlap in physical space.`,
        );
      }
    }
  }
}

/**
 * Compares two sets of generated compartments across template edits to identify
 * retained, added, removed, and dimensionally modified slots.
 *
 * Uses stable topological `slotId` to ensure location mappings and draft states
 * are preserved when outer dimensions change, and clearly identifies deletions
 * when subdivision counts decrease.
 *
 * Distinguishes:
 * 1. Pure dimensional resizing (retained + modified, isStructuralChange: false)
 * 2. Additions / Deletions (added/removed, isStructuralChange: true)
 * 3. Semantic & Topological changes where slotIds match but physical meaning has changed
 *    (meaningChangedSlots, isStructuralChange: true)
 */
export function diffParametricCompartments(
  previous: GeneratedCompartment[],
  next: GeneratedCompartment[],
): ParametricCompartmentDiff {
  const prevMap = new Map<string, GeneratedCompartment>();
  for (const c of previous) {
    prevMap.set(c.slotId, c);
  }

  const nextMap = new Map<string, GeneratedCompartment>();
  for (const c of next) {
    nextMap.set(c.slotId, c);
  }

  const retained: GeneratedCompartment[] = [];
  const added: GeneratedCompartment[] = [];
  const modified: ParametricCompartmentDiff["modified"] = [];
  const meaningChangedSlots: ParametricCompartmentDiff["meaningChangedSlots"] = [];

  // Detect whether logical row orientation (e.g. top_to_bottom vs bottom_to_top) inverted
  let rowOrientationInverted = false;
  if (previous.length > 1 && next.length > 1) {
    const prevSortedByRow = previous
      .slice()
      .sort((a, b) => a.logicalIndex.row - b.logicalIndex.row);
    const nextSortedByRow = next
      .slice()
      .sort((a, b) => a.logicalIndex.row - b.logicalIndex.row);

    const prevFirst = prevSortedByRow[0]!;
    const prevLast = prevSortedByRow[prevSortedByRow.length - 1]!;
    const nextFirst = nextSortedByRow[0]!;
    const nextLast = nextSortedByRow[nextSortedByRow.length - 1]!;

    if (
      prevFirst.logicalIndex.row !== prevLast.logicalIndex.row &&
      nextFirst.logicalIndex.row !== nextLast.logicalIndex.row
    ) {
      const prevIsTopToBottom = prevFirst.position.y > prevLast.position.y;
      const nextIsTopToBottom = nextFirst.position.y > nextLast.position.y;
      if (prevIsTopToBottom !== nextIsTopToBottom) {
        rowOrientationInverted = true;
      }
    }
  }

  for (const current of next) {
    const prev = prevMap.get(current.slotId);
    if (!prev) {
      added.push(current);
    } else {
      retained.push(current);
      const isGeometricallyModified =
        prev.dimensions.widthMm !== current.dimensions.widthMm ||
        prev.dimensions.heightMm !== current.dimensions.heightMm ||
        prev.dimensions.depthMm !== current.dimensions.depthMm ||
        prev.position.x !== current.position.x ||
        prev.position.y !== current.position.y ||
        prev.position.z !== current.position.z ||
        prev.code !== current.code;

      if (isGeometricallyModified) {
        modified.push({ previous: prev, current });
      }

      // Check if slot ID matched, but physical meaning or logical code changed
      const reasons: string[] = [];
      if (prev.code !== current.code) {
        reasons.push(`Code changed from '${prev.code}' to '${current.code}'`);
      }
      if (rowOrientationInverted) {
        reasons.push(
          "Row orientation inverted (e.g. top_to_bottom vs bottom_to_top)",
        );
      }
      if (prev.metadata.templateType !== current.metadata.templateType) {
        reasons.push(
          `Template type changed from '${prev.metadata.templateType}' to '${current.metadata.templateType}'`,
        );
      }
      if (reasons.length > 0) {
        meaningChangedSlots.push({
          previous: prev,
          current,
          reason: reasons.join("; "),
        });
      }
    }
  }

  const removed: GeneratedCompartment[] = [];
  for (const prev of previous) {
    if (!nextMap.has(prev.slotId)) {
      removed.push(prev);
    }
  }

  const hasChanges =
    added.length > 0 || removed.length > 0 || modified.length > 0;

  const isStructuralChange =
    added.length > 0 ||
    removed.length > 0 ||
    meaningChangedSlots.length > 0 ||
    (previous.length > 0 &&
      next.length > 0 &&
      previous[0]?.metadata.templateType !== next[0]?.metadata.templateType);

  return {
    retained,
    added,
    removed,
    modified,
    hasChanges,
    isStructuralChange,
    meaningChangedSlots,
  };
}

function roundMm(val: number): number {
  return Math.round(val * 100) / 100;
}

// ==========================================
// Default Configuration Factories
// ==========================================

export function createDefaultSmdCabinetConfig(): SmdDrawerCabinetConfig {
  return {
    templateType: "SMD_DRAWER_CABINET",
    dimensions: {
      widthMm: 600,
      heightMm: 900,
      depthMm: 300,
    },
    wallThicknessMm: 15,
    rows: 6,
    columns: 10,
    dividerThicknessMm: 2,
    naming: {
      pattern: "ROW_COL_ALPHA_NUM",
      padDigits: 2,
      rowOrder: "top_to_bottom",
    },
  };
}

export function createDefaultOpenBinMatrixConfig(): OpenBinMatrixConfig {
  return {
    templateType: "OPEN_BIN_MATRIX",
    dimensions: {
      widthMm: 1000,
      heightMm: 1200,
      depthMm: 400,
    },
    wallThicknessMm: 20,
    tiers: 5,
    binsPerTier: 8,
    tierSpacingMm: 10,
    binSpacingMm: 6,
    naming: {
      pattern: "ROW_COL_ALPHA_NUM",
      padDigits: 2,
      rowOrder: "top_to_bottom",
    },
  };
}

export function createDefaultPalletRackConfig(): PalletRackConfig {
  return {
    templateType: "PALLET_RACK",
    dimensions: {
      widthMm: 2400,
      heightMm: 3000,
      depthMm: 1100,
    },
    wallThicknessMm: 50,
    levels: 4,
    baysPerLevel: 2,
    uprightPostWidthMm: 50,
    beamHeightMm: 40,
    naming: {
      pattern: "LEVEL_BAY_NUMERIC",
      rowOrder: "bottom_to_top",
    },
  };
}

export function createDefaultGridPartsTrayConfig(): GridPartsTrayConfig {
  return {
    templateType: "GRID_PARTS_TRAY",
    dimensions: {
      widthMm: 400,
      heightMm: 60,
      depthMm: 300,
    },
    wallThicknessMm: 6,
    rows: 4,
    columns: 6,
    dividerThicknessMm: 2,
    naming: {
      pattern: "ROW_COL_ALPHA_NUM",
      padDigits: 2,
      rowOrder: "top_to_bottom",
    },
  };
}

export function createDefaultReelRackConfig(): ReelRackConfig {
  return {
    templateType: "REEL_RACK",
    dimensions: { widthMm: 1000, heightMm: 1800, depthMm: 450 },
    wallThicknessMm: 20,
    rows: 4,
    columns: 5,
    slotSpacingMm: 12,
    uprightWidthMm: 35,
    crossbarHeightMm: 25,
    naming: { pattern: "ROW_COL_NUMERIC", rowOrder: "bottom_to_top" },
  };
}

export function createDefaultDryCabinetConfig(): DryCabinetConfig {
  return {
    templateType: "DRY_CABINET",
    dimensions: { widthMm: 900, heightMm: 1800, depthMm: 600 },
    wallThicknessMm: 24,
    rows: 4,
    columns: 1,
    childCategory: "drawer",
    childSpacingMm: 16,
    naming: { pattern: "SEQUENTIAL", padDigits: 2, rowOrder: "bottom_to_top" },
  };
}
