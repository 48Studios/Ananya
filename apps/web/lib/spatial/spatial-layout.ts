import type { LocationOperationalViewChildDto } from "../api/spatial-api";

export interface SpatialGridCell {
  key: string;
  child: LocationOperationalViewChildDto;
  rowLabel?: string;
  colIndex?: number;
  // Resolved 2D display coordinates if available (in mm or relative units)
  posX?: number;
  posY?: number;
  source: "explicit" | "anchor" | "pattern" | "fallback";
}

export interface SpatialGridRow {
  rowLabel: string;
  cells: SpatialGridCell[];
}

export interface SpatialGridLayout {
  type: "matrix" | "grid";
  rows?: SpatialGridRow[];
  cells: SpatialGridCell[];
  columnCount?: number;
}

/**
 * Regex to extract alphanumeric Row and Column designations from storage codes.
 * Examples matched:
 * - A01, A-01, A_01, A1 -> Row: "A", Col: 1
 * - ROW-B-04 -> Row: "B", Col: 4
 * - D-C02 -> Row: "C", Col: 2
 */
const MATRIX_PATTERN =
  /^(?:.*[-_ ])?([A-Za-z]{1,2})[-_ ]?0*([0-9]+)$/;

/**
 * Computes the optimal 2D operational layout for child locations.
 * Follows the strict preference order:
 * 1. Explicit spatial position (SpatialNode positionX/positionY)
 * 2. Anchor position (SpatialAnchor localPositionX/localPositionY)
 * 3. Deterministic matrix pattern or sorted grid fallback
 */
export function computeSpatialLayout(
  children: LocationOperationalViewChildDto[],
): SpatialGridLayout {
  if (!children || children.length === 0) {
    return {
      type: "grid",
      cells: [],
      columnCount: 0,
    };
  }

  // Check if at least some children have explicit 2D coordinates or anchors
  const hasExplicitPositions = children.some(
    (c) =>
      c.node &&
      (c.node.positionX !== 0 || c.node.positionY !== 0) &&
      !isNaN(c.node.positionX) &&
      !isNaN(c.node.positionY),
  );

  const hasAnchorPositions = children.some(
    (c) =>
      c.anchor &&
      (c.anchor.localPositionX !== 0 || c.anchor.localPositionY !== 0) &&
      !isNaN(c.anchor.localPositionX) &&
      !isNaN(c.anchor.localPositionY),
  );

  // 1. If explicit spatial positions are specified
  if (hasExplicitPositions) {
    const cells: SpatialGridCell[] = children.map((c) => ({
      key: c.location.id,
      child: c,
      posX: c.node?.positionX ?? 0,
      posY: c.node?.positionY ?? 0,
      source: "explicit",
    }));

    // Sort top-to-bottom (Y desc or asc), left-to-right (X asc)
    cells.sort((a, b) => {
      const yDiff = (b.posY ?? 0) - (a.posY ?? 0);
      if (Math.abs(yDiff) > 10) return yDiff; // grouped by Y level
      return (a.posX ?? 0) - (b.posX ?? 0);
    });

    return {
      type: "grid",
      cells,
      columnCount: Math.min(10, Math.max(3, Math.ceil(Math.sqrt(cells.length)))),
    };
  }

  // 2. If anchor positions are available
  if (hasAnchorPositions) {
    const cells: SpatialGridCell[] = children.map((c) => ({
      key: c.location.id,
      child: c,
      posX: c.anchor?.localPositionX ?? 0,
      posY: c.anchor?.localPositionY ?? 0,
      source: "anchor",
    }));

    cells.sort((a, b) => {
      const yDiff = (b.posY ?? 0) - (a.posY ?? 0);
      if (Math.abs(yDiff) > 10) return yDiff;
      return (a.posX ?? 0) - (b.posX ?? 0);
    });

    return {
      type: "grid",
      cells,
      columnCount: Math.min(10, Math.max(3, Math.ceil(Math.sqrt(cells.length)))),
    };
  }

  // 3. Try alphanumeric matrix pattern detection (e.g. A01..A10, B01..B10)
  type ParsedLocation = {
    child: LocationOperationalViewChildDto;
    rowStr: string;
    colNum: number;
  };

  const parsedList: ParsedLocation[] = [];
  let matchesCount = 0;

  for (const child of children) {
    const match = MATRIX_PATTERN.exec(child.location.code.trim());
    if (match && match[1] && match[2]) {
      parsedList.push({
        child,
        rowStr: match[1].toUpperCase(),
        colNum: parseInt(match[2], 10),
      });
      matchesCount++;
    } else {
      parsedList.push({
        child,
        rowStr: "",
        colNum: 0,
      });
    }
  }

  // If majority of items (>60%) match a matrix pattern, arrange as a matrix
  if (matchesCount >= children.length * 0.6 && matchesCount >= 2) {
    const rowMap = new Map<string, SpatialGridCell[]>();
    const unparsedCells: SpatialGridCell[] = [];

    for (const item of parsedList) {
      if (item.rowStr) {
        const cell: SpatialGridCell = {
          key: item.child.location.id,
          child: item.child,
          rowLabel: item.rowStr,
          colIndex: item.colNum,
          source: "pattern",
        };
        const existing = rowMap.get(item.rowStr) || [];
        existing.push(cell);
        rowMap.set(item.rowStr, existing);
      } else {
        unparsedCells.push({
          key: item.child.location.id,
          child: item.child,
          source: "fallback",
        });
      }
    }

    // Sort rows alphabetically or numerically
    const sortedRowLabels = Array.from(rowMap.keys()).sort((a, b) => {
      const aNum = Number(a);
      const bNum = Number(b);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });

    const rows: SpatialGridRow[] = [];
    const allCells: SpatialGridCell[] = [];

    for (const label of sortedRowLabels) {
      const cells = rowMap.get(label)!;
      // Sort columns numerically
      cells.sort((a, b) => (a.colIndex ?? 0) - (b.colIndex ?? 0));
      rows.push({
        rowLabel: label,
        cells,
      });
      allCells.push(...cells);
    }

    // Append unparsed cells in a separate "Other" row if any exist
    if (unparsedCells.length > 0) {
      unparsedCells.sort((a, b) =>
        a.child.location.code.localeCompare(b.child.location.code, undefined, {
          numeric: true,
        }),
      );
      rows.push({
        rowLabel: "Other",
        cells: unparsedCells,
      });
      allCells.push(...unparsedCells);
    }

    if (rows.length >= 2) {
      return {
        type: "matrix",
        rows,
        cells: allCells,
      };
    }
  }

  // 4. Deterministic fallback grid sorted naturally by location code
  const sorted = [...children].sort((a, b) =>
    a.location.code.localeCompare(b.location.code, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  const fallbackCells: SpatialGridCell[] = sorted.map((child) => ({
    key: child.location.id,
    child,
    source: "fallback",
  }));

  // Determine balanced column count based on size
  let cols = 4;
  if (fallbackCells.length <= 4) cols = fallbackCells.length;
  else if (fallbackCells.length <= 12) cols = 4;
  else if (fallbackCells.length <= 24) cols = 6;
  else if (fallbackCells.length <= 60) cols = 8;
  else cols = 10;

  return {
    type: "grid",
    cells: fallbackCells,
    columnCount: cols,
  };
}
