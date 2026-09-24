"use client";

import type { LabelData, BarcodeFormat } from "@/lib/api/barcodes-api";
import { BarcodeViewer } from "../barcode-viewer";
import { QRCodeViewer } from "../qr-code-viewer";

export interface DetailedLabelProps {
  label: LabelData;
  organizationName: string;
  format?: BarcodeFormat;
  className?: string;
}

/**
 * Detailed label (3" × 4") — the largest face: title, item code, QR, a 1D
 * barcode and the owning organisation in the footer.
 */
export function DetailedLabel({
  label,
  organizationName,
  format = "CODE128",
  className = "",
}: DetailedLabelProps) {
  return (
    <div
      className={`w-96 p-4 bg-white text-black border border-slate-400 rounded-lg shadow-xs gap-2 select-none print:shadow-none print:break-inside-avoid ${className}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="space-y-0.5">
          <h4 className="text-sm font-extrabold text-slate-900 leading-snug">
            {label.title}
          </h4>
          <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
            {label.primaryCode}
          </span>
        </div>
        <QRCodeViewer
          value={label.qrPayload}
          size={64}
          className="p-1 border-0"
        />
      </div>

      <div className="flex flex-col items-center justify-center mb-3 mt-1">
        <BarcodeViewer
          value={label.primaryCode}
          format={format}
          height={55}
          showText
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono tracking-wider border-t border-slate-200 pt-3">
        <span className="font-bold tracking-wider uppercase truncate">
          {organizationName}
        </span>
        <span>{label.entityType}</span>
      </div>
    </div>
  );
}
