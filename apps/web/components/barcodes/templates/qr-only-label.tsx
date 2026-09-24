"use client";

import type { LabelData } from "@/lib/api/barcodes-api";
import { QRCodeViewer } from "../qr-code-viewer";

export interface QrOnlyLabelProps {
  label: LabelData;
  className?: string;
}

/**
 * QR only (1" × 1") — a QR with nothing but the item code under it. The
 * smallest face for a bin, a drawer or a spool where the QR does the work.
 */
export function QrOnlyLabel({ label, className = "" }: QrOnlyLabelProps) {
  return (
    <div
      className={`flex flex-col w-32 h-32 p-2 bg-white text-black border border-slate-300 rounded-lg shadow-xs flex items-center justify-center select-none print:shadow-none print:border-black print:break-inside-avoid ${className}`}
    >
      <QRCodeViewer value={label.qrPayload} size={80} className="p-0 border-0" />
      <div className="flex justify-center items-center w-full text-center border-t border-slate-200 pt-2">
        <span className="inline-block font-mono text-xs font-bold">
          {label.primaryCode}
        </span>
      </div>
    </div>
  );
}
