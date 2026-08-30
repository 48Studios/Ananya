"use client";

import * as React from "react";

export interface QRCodeViewerProps {
  value: string;
  size?: number;
  className?: string;
}

// ----------------------------------------------------------------------
// ISO/IEC 18004 Standard QR Code Engine (Pure TypeScript, Zero-Dependency)
// ----------------------------------------------------------------------

const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

let gfVal = 1;
for (let i = 0; i < 255; i++) {
  EXP_TABLE[i] = gfVal;
  EXP_TABLE[i + 255] = gfVal;
  LOG_TABLE[gfVal] = i;
  gfVal <<= 1;
  if (gfVal >= 256) {
    gfVal ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
  }
}

function gmul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a]! + LOG_TABLE[b]!]!;
}

function getGeneratorPolynomial(ecCount: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = [1, EXP_TABLE[i]!];
    const res = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      for (let k = 0; k < next.length; k++) {
        res[j + k] ^= gmul(poly[j]!, next[k]!);
      }
    }
    poly = res;
  }
  return poly;
}

function calculateReedSolomon(data: number[], ecCount: number): number[] {
  const gen = getGeneratorPolynomial(ecCount);
  const result = new Array(data.length + ecCount).fill(0);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i]!;
  }

  for (let i = 0; i < data.length; i++) {
    const coef = result[i]!;
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        result[i + j] ^= gmul(gen[j]!, coef);
      }
    }
  }

  return result.slice(data.length);
}

interface QRVersionConfig {
  version: number;
  size: number;
  dataCodewords: number;
  blocks: Array<{ count: number; data: number; ec: number }>;
  align: number[];
}

const QR_VERSIONS: QRVersionConfig[] = [
  { version: 1, size: 21, dataCodewords: 19, blocks: [{ count: 1, data: 19, ec: 7 }], align: [] },
  { version: 2, size: 25, dataCodewords: 34, blocks: [{ count: 1, data: 34, ec: 10 }], align: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, blocks: [{ count: 1, data: 55, ec: 15 }], align: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, blocks: [{ count: 1, data: 80, ec: 20 }], align: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, blocks: [{ count: 1, data: 108, ec: 26 }], align: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, blocks: [{ count: 2, data: 68, ec: 18 }], align: [6, 34] },
  { version: 7, size: 45, dataCodewords: 156, blocks: [{ count: 2, data: 78, ec: 20 }], align: [6, 22, 38] },
  { version: 8, size: 49, dataCodewords: 194, blocks: [{ count: 2, data: 97, ec: 24 }], align: [6, 24, 42] },
  { version: 9, size: 53, dataCodewords: 232, blocks: [{ count: 2, data: 116, ec: 30 }], align: [6, 26, 46] },
  { version: 10, size: 57, dataCodewords: 274, blocks: [{ count: 2, data: 68, ec: 18 }, { count: 2, data: 69, ec: 18 }], align: [6, 28, 50] },
];

const FORMAT_BITS = [
  true, true, true, false, true, true, true, true,
  false, true, false, false, false, true, true
]; // Level L, Mask 0 (111011110100011)

function generateISOQRMatrix(payload: string): boolean[][] {
  const encoder = new TextEncoder();
  const rawBytes = Array.from(encoder.encode(payload || "ANANYA"));

  const reqDataBytes = rawBytes.length + 2;
  let vInfo = QR_VERSIONS.find((v) => v.dataCodewords >= reqDataBytes);
  if (!vInfo) {
    vInfo = QR_VERSIONS[QR_VERSIONS.length - 1]!;
  }

  // 1. Bitstream encoding in Byte Mode (0100)
  let bitStr = "0100";
  bitStr += rawBytes.length.toString(2).padStart(8, "0");
  for (const b of rawBytes) {
    bitStr += b.toString(2).padStart(8, "0");
  }

  // Terminator (up to 4 zeroes)
  const maxBits = vInfo.dataCodewords * 8;
  const termLen = Math.min(4, maxBits - bitStr.length);
  for (let i = 0; i < termLen; i++) bitStr += "0";

  // Pad to byte boundary
  while (bitStr.length % 8 !== 0) bitStr += "0";

  // Convert to data codewords
  const dataCodewords: number[] = [];
  for (let i = 0; i < bitStr.length; i += 8) {
    dataCodewords.push(parseInt(bitStr.slice(i, i + 8), 2));
  }

  // Pad bytes (0xEC, 0x11)
  let padToggle = true;
  while (dataCodewords.length < vInfo.dataCodewords) {
    dataCodewords.push(padToggle ? 0xec : 0x11);
    padToggle = !padToggle;
  }

  // 2. Generate Reed-Solomon Error Correction blocks
  const allDataBlocks: number[][] = [];
  const allEcBlocks: number[][] = [];

  let dataOffset = 0;
  for (const b of vInfo.blocks) {
    for (let c = 0; c < b.count; c++) {
      const blockData = dataCodewords.slice(dataOffset, dataOffset + b.data);
      dataOffset += b.data;
      const ecData = calculateReedSolomon(blockData, b.ec);
      allDataBlocks.push(blockData);
      allEcBlocks.push(ecData);
    }
  }

  // Interleave data blocks & EC blocks
  const finalCodewords: number[] = [];
  const maxDataBlockLen = Math.max(...allDataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataBlockLen; i++) {
    for (const b of allDataBlocks) {
      if (i < b.length) finalCodewords.push(b[i]!);
    }
  }

  const maxEcBlockLen = Math.max(...allEcBlocks.map((b) => b.length));
  for (let i = 0; i < maxEcBlockLen; i++) {
    for (const b of allEcBlocks) {
      if (i < b.length) finalCodewords.push(b[i]!);
    }
  }

  // Convert final codewords into bit array
  const finalBits: boolean[] = [];
  for (const cw of finalCodewords) {
    const s = cw.toString(2).padStart(8, "0");
    for (let i = 0; i < 8; i++) finalBits.push(s[i] === "1");
  }

  // 3. Construct Matrix
  const size = vInfo.size;
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );

  // Finder Patterns (7x7) + Separators
  const addFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          isFunction[nr]![nc] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            matrix[nr]![nc] =
              r === 0 ||
              r === 6 ||
              c === 0 ||
              c === 6 ||
              (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          } else {
            matrix[nr]![nc] = false;
          }
        }
      }
    }
  };

  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // Alignment Patterns (5x5)
  if (vInfo.align.length > 0) {
    for (const r of vInfo.align) {
      for (const c of vInfo.align) {
        if (
          (r <= 8 && c <= 8) ||
          (r <= 8 && c >= size - 8) ||
          (r >= size - 8 && c <= 8)
        ) {
          continue;
        }
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            isFunction[nr]![nc] = true;
            matrix[nr]![nc] =
              dr === -2 ||
              dr === 2 ||
              dc === -2 ||
              dc === 2 ||
              (dr === 0 && dc === 0);
          }
        }
      }
    }
  }

  // Timing Tracks (Row 6, Col 6)
  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6]![i]) {
      isFunction[6]![i] = true;
      matrix[6]![i] = i % 2 === 0;
    }
    if (!isFunction[i]![6]) {
      isFunction[i]![6] = true;
      matrix[i]![6] = i % 2 === 0;
    }
  }

  // Dark Module
  const darkR = 4 * vInfo.version + 9;
  isFunction[darkR]![8] = true;
  matrix[darkR]![8] = true;

  // Reserve Format Info areas
  for (let i = 0; i < 9; i++) {
    isFunction[8]![i] = true;
    isFunction[i]![8] = true;
    isFunction[8]![size - 1 - i] = true;
    isFunction[size - 1 - i]![8] = true;
  }

  // 4. Place Data Bits in 2-column Zig-Zag with Mask 0 ((r + c) % 2 === 0)
  let bitIdx = 0;
  let upwards = true;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing track
    const cols = [right, right - 1];

    const rows: number[] = [];
    if (upwards) {
      for (let r = size - 1; r >= 0; r--) rows.push(r);
    } else {
      for (let r = 0; r < size; r++) rows.push(r);
    }

    for (const r of rows) {
      for (const c of cols) {
        if (!isFunction[r]![c]) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++]! : false;
          const mask = (r + c) % 2 === 0;
          matrix[r]![c] = mask ? !bit : bit;
        }
      }
    }

    upwards = !upwards;
  }

  // 5. Apply Standard Format Information (Level L, Mask 0)
  matrix[8]![0] = FORMAT_BITS[0]!;
  matrix[8]![1] = FORMAT_BITS[1]!;
  matrix[8]![2] = FORMAT_BITS[2]!;
  matrix[8]![3] = FORMAT_BITS[3]!;
  matrix[8]![4] = FORMAT_BITS[4]!;
  matrix[8]![5] = FORMAT_BITS[5]!;
  matrix[8]![7] = FORMAT_BITS[6]!;
  matrix[8]![8] = FORMAT_BITS[7]!;
  matrix[7]![8] = FORMAT_BITS[8]!;
  matrix[5]![8] = FORMAT_BITS[9]!;
  matrix[4]![8] = FORMAT_BITS[10]!;
  matrix[3]![8] = FORMAT_BITS[11]!;
  matrix[2]![8] = FORMAT_BITS[12]!;
  matrix[1]![8] = FORMAT_BITS[13]!;
  matrix[0]![8] = FORMAT_BITS[14]!;

  // Secondary Format Information copies
  for (let i = 0; i < 8; i++) {
    matrix[8]![size - 1 - i] = FORMAT_BITS[i]!;
  }
  for (let i = 0; i < 7; i++) {
    matrix[size - 7 + i]![8] = FORMAT_BITS[8 + i]!;
  }

  return matrix;
}

export function QRCodeViewer({
  value,
  size = 120,
  className = "",
}: QRCodeViewerProps) {
  const matrix = React.useMemo(() => generateISOQRMatrix(value), [value]);
  const count = matrix.length;
  // Quiet zone: 2 modules
  const quietZone = 2;
  const totalCount = count + quietZone * 2;
  const cellSize = size / totalCount;

  return (
    <div
      className={`inline-block select-none bg-white p-1.5 rounded-lg border border-border print:border-0 print:p-0 ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
      >
        <rect width={size} height={size} fill="#ffffff" />
        {matrix.map((row, r) =>
          row.map((cell, c) =>
            cell ? (
              <rect
                key={`${r}-${c}`}
                x={(c + quietZone) * cellSize}
                y={(r + quietZone) * cellSize}
                width={cellSize + 0.05}
                height={cellSize + 0.05}
                fill="#000000"
              />
            ) : null,
          ),
        )}
      </svg>
    </div>
  );
}

