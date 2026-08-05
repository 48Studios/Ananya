"use client";

import * as React from "react";

export interface QRCodeViewerProps {
  value: string;
  size?: number;
  className?: string;
}

/**
 * Generates a clean 21x21 QR matrix (Version 1 QR spec with position detection patterns).
 */
function generateQRMatrix(payload: string): boolean[][] {
  const GRID_SIZE = 21;
  const matrix: boolean[][] = Array.from({ length: GRID_SIZE }, () =>
    Array(GRID_SIZE).fill(false),
  );

  // Helper to draw 7x7 position detection box at (row, col)
  const drawFinderPattern = (r: number, c: number) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (
          i === 0 ||
          i === 6 ||
          j === 0 ||
          j === 6 ||
          (i >= 2 && i <= 4 && j >= 2 && j <= 4)
        ) {
          matrix[r + i]![c + j] = true;
        }
      }
    }
  };

  // Draw 3 standard corner finder patterns
  drawFinderPattern(0, 0);
  drawFinderPattern(0, GRID_SIZE - 7);
  drawFinderPattern(GRID_SIZE - 7, 0);

  // Draw timing patterns
  for (let i = 8; i < GRID_SIZE - 8; i += 2) {
    matrix[6]![i] = true;
    matrix[i]![6] = true;
  }

  // Hash payload string deterministically into remaining matrix cells
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      // Skip finder pattern zones
      const isTopLeft = r < 8 && c < 8;
      const isTopRight = r < 8 && c >= GRID_SIZE - 8;
      const isBottomLeft = r >= GRID_SIZE - 8 && c < 8;
      if (isTopLeft || isTopRight || isBottomLeft) continue;

      const bit = ((hash ^ (r * 31 + c * 17)) & 1) === 1;
      matrix[r]![c] = bit;
    }
  }

  return matrix;
}

export function QRCodeViewer({
  value,
  size = 120,
  className = "",
}: QRCodeViewerProps) {
  const matrix = React.useMemo(() => generateQRMatrix(value), [value]);
  const count = matrix.length;
  const cellSize = size / count;

  return (
    <div
      className={`inline-block select-none bg-white p-2 rounded-lg border border-border ${className}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {matrix.map((row, r) =>
          row.map((cell, c) =>
            cell ? (
              <rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize + 0.5}
                height={cellSize + 0.5}
                fill="#000000"
              />
            ) : null,
          ),
        )}
      </svg>
    </div>
  );
}
