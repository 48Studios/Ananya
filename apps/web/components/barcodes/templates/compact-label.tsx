"use client";

import type { LabelData } from "@/lib/api/barcodes-api";
import { QRCodeViewer } from "../qr-code-viewer";

export interface CompactLabelProps {
  label: LabelData;
  className?: string;
}

/**
 * Compact label (1" × 2") — title and item code beside a small QR, for rack
 * edges and tight spaces.
 */
export function CompactLabel({ label, className = "" }: CompactLabelProps) {
  return (
    <div
      className={`w-64 p-3 bg-white text-black border border-slate-300 rounded-md shadow-xs flex items-center justify-between gap-2 select-none print:shadow-none print:border-black print:break-inside-avoid ${className}`}
    >
      <div className="space-y-0.5 min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-900 truncate uppercase">
          {label.title}
        </p>
        <p className="text-[10px] font-mono text-slate-600 truncate font-semibold">
          {label.primaryCode}
        </p>
      </div>
      <QRCodeViewer value={label.qrPayload} size={48} className="p-1 border-0" />
    </div>
  );
}
