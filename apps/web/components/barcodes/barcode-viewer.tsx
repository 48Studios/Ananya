"use client";

import * as React from "react";
import { BarcodeFormat } from "@/lib/api/barcodes-api";

export interface BarcodeViewerProps {
  value: string;
  format?: BarcodeFormat;
  height?: number;
  showText?: boolean;
  className?: string;
}

// ----------------------------------------------------------------------
// Code 128 (Subset B) Table & Encoder
// ----------------------------------------------------------------------
const CODE128_PATTERNS: string[] = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
  "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
  "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
  "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
  "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
  "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
  "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
  "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
  "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
  "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
  "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
  "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
  "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
  "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
  "11010011100", "1100011101011"
];

function encodeCode128(text: string): boolean[] {
  const clean = text || "ANANYA";
  const codes: number[] = [104]; // Start B
  let checksum = 104;

  for (let i = 0; i < clean.length; i++) {
    const charCode = clean.charCodeAt(i);
    const code = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
    codes.push(code);
    checksum += code * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop

  const bits: boolean[] = [false, false, false, false, false, false, false, false, false, false];
  for (const c of codes) {
    const pattern = CODE128_PATTERNS[c] || CODE128_PATTERNS[0]!;
    for (let j = 0; j < pattern.length; j++) {
      bits.push(pattern[j] === "1");
    }
  }
  bits.push(false, false, false, false, false, false, false, false, false, false);
  return bits;
}

// ----------------------------------------------------------------------
// Code 39 Table & Encoder
// ----------------------------------------------------------------------
const CODE39_MAP: Record<string, string> = {
  "0": "101001101101", "1": "110100101011", "2": "101100101011", "3": "110110010101",
  "4": "101001101011", "5": "110100110101", "6": "101100110101", "7": "101001011011",
  "8": "110100101101", "9": "101100101101", "A": "110101001011", "B": "101101001011",
  "C": "110110100101", "D": "101011001011", "E": "110101100101", "F": "101101100101",
  "G": "101010011011", "H": "110101001101", "I": "101101001101", "J": "101011001101",
  "K": "110101010011", "L": "101101010011", "M": "110110101001", "N": "101011010011",
  "O": "110101101001", "P": "101101101001", "Q": "101010110011", "R": "110101011001",
  "S": "101101011001", "T": "101011011001", "U": "110010101011", "V": "100110101011",
  "W": "110011010101", "X": "100101101011", "Y": "110010110101", "Z": "100110110101",
  "-": "100101011011", ".": "110010101101", " ": "100110101101", "$": "100100100101",
  "/": "100100101001", "+": "100101001001", "%": "101001001001", "*": "100101101101",
};

function encodeCode39(text: string): boolean[] {
  const upper = `*${(text || "ANANYA").toUpperCase().replace(/[^0-9A-Z\-.$/+% ]/g, "-")}*`;
  const bits: boolean[] = [false, false, false, false, false, false, false, false, false, false];

  for (let i = 0; i < upper.length; i++) {
    const char = upper[i] || "-";
    const pattern = CODE39_MAP[char] || CODE39_MAP["-"]!;
    for (let j = 0; j < pattern.length; j++) {
      bits.push(pattern[j] === "1");
    }
    bits.push(false);
  }

  bits.push(false, false, false, false, false, false, false, false, false);
  return bits;
}

// ----------------------------------------------------------------------
// EAN-13 Table & Encoder
// ----------------------------------------------------------------------
const EAN_L: string[] = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const EAN_G: string[] = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const EAN_R: string[] = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];
const EAN_PARITY: string[] = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

function encodeEan13(text: string): boolean[] {
  let digits = text.replace(/\D/g, "");
  if (digits.length < 12) {
    digits = digits.padStart(12, "0");
  } else {
    digits = digits.slice(0, 12);
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(digits[i]!, 10);
    sum += i % 2 === 0 ? n : n * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  const full13 = digits + checkDigit.toString();
  const firstDigit = parseInt(full13[0]!, 10);
  const parity = EAN_PARITY[firstDigit] || "LLLLLL";

  const bits: boolean[] = [false, false, false, false, false, false, false, false, false];
  bits.push(true, false, true); // Start Guard

  for (let i = 1; i <= 6; i++) {
    const d = parseInt(full13[i]!, 10);
    const useG = parity[i - 1] === "G";
    const pattern = useG ? EAN_G[d]! : EAN_L[d]!;
    for (let j = 0; j < pattern.length; j++) {
      bits.push(pattern[j] === "1");
    }
  }

  bits.push(false, true, false, true, false); // Center Guard

  for (let i = 7; i <= 12; i++) {
    const d = parseInt(full13[i]!, 10);
    const pattern = EAN_R[d]!;
    for (let j = 0; j < pattern.length; j++) {
      bits.push(pattern[j] === "1");
    }
  }

  bits.push(true, false, true); // End Guard
  bits.push(false, false, false, false, false, false, false, false, false);
  return bits;
}

// ----------------------------------------------------------------------
// UPC-A Table & Encoder
// ----------------------------------------------------------------------
function encodeUpcA(text: string): boolean[] {
  let digits = text.replace(/\D/g, "");
  if (digits.length < 11) {
    digits = digits.padStart(11, "0");
  } else {
    digits = digits.slice(0, 11);
  }

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const n = parseInt(digits[i]!, 10);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  const full12 = digits + checkDigit.toString();

  const bits: boolean[] = [false, false, false, false, false, false, false, false, false];
  bits.push(true, false, true); // Start Guard

  for (let i = 0; i < 6; i++) {
    const d = parseInt(full12[i]!, 10);
    const pattern = EAN_L[d]!;
    for (let j = 0; j < pattern.length; j++) {
      bits.push(pattern[j] === "1");
    }
  }

  bits.push(false, true, false, true, false); // Center Guard

  for (let i = 6; i < 12; i++) {
    const d = parseInt(full12[i]!, 10);
    const pattern = EAN_R[d]!;
    for (let j = 0; j < pattern.length; j++) {
      bits.push(pattern[j] === "1");
    }
  }

  bits.push(true, false, true); // End Guard
  bits.push(false, false, false, false, false, false, false, false, false);
  return bits;
}

function encodeToBars(value: string, format: BarcodeFormat): boolean[] {
  switch (format) {
    case "CODE39":
      return encodeCode39(value);
    case "EAN13":
      return encodeEan13(value);
    case "UPCA":
      return encodeUpcA(value);
    case "CODE128":
    default:
      return encodeCode128(value);
  }
}

function getDisplayLabelText(value: string, format: BarcodeFormat): string {
  if (!value) return "N/A";
  if (format === "EAN13") {
    let digits = value.replace(/\D/g, "");
    if (digits.length < 12) digits = digits.padStart(12, "0");
    else digits = digits.slice(0, 12);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const n = parseInt(digits[i]!, 10);
      sum += i % 2 === 0 ? n : n * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return `${digits}${checkDigit}`;
  }
  if (format === "UPCA") {
    let digits = value.replace(/\D/g, "");
    if (digits.length < 11) digits = digits.padStart(11, "0");
    else digits = digits.slice(0, 11);
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      const n = parseInt(digits[i]!, 10);
      sum += i % 2 === 0 ? n * 3 : n;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return `${digits}${checkDigit}`;
  }
  return value;
}

export function BarcodeViewer({
  value,
  format = "CODE128",
  height = 50,
  showText = true,
  className = "",
}: BarcodeViewerProps) {
  const bars = React.useMemo(
    () => encodeToBars(value, format),
    [value, format],
  );
  const displayValue = React.useMemo(
    () => getDisplayLabelText(value, format),
    [value, format],
  );

  const barWidth = 2;
  const svgWidth = bars.length * barWidth + 20;

  return (
    <div
      className={`inline-flex flex-col items-center select-none ${className}`}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${svgWidth} ${height}`}
        className="fill-current text-foreground"
      >
        <rect width={svgWidth} height={height} fill="transparent" />
        <g transform="translate(10, 0)">
          {bars.map((isBar, idx) =>
            isBar ? (
              <rect
                key={idx}
                x={idx * barWidth}
                y={0}
                width={barWidth}
                height={height - (showText ? 14 : 0)}
              />
            ) : null,
          )}
        </g>
      </svg>
      {showText && (
        <span className="font-mono text-[10px] tracking-widest text-foreground font-bold mt-0.5 uppercase">
          {displayValue}
        </span>
      )}
    </div>
  );
}

