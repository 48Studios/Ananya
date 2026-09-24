"use client";

import type { LabelData, BarcodeFormat } from "@/lib/api/barcodes-api";
import { BarcodeViewer } from "../barcode-viewer";
import { QRCodeViewer } from "../qr-code-viewer";
import { cleanSubtitle } from "./label-text";

export interface StandardLabelProps {
  label: LabelData;
  format?: BarcodeFormat;
  className?: string;
}

/**
 * Standard label (2" × 4") — the default: title, subtitle, item code, QR and a
 * 1D barcode. The only template that prints a linear barcode.
 */
export function StandardLabel({
  label,
  format = "CODE128",
  className = "",
}: StandardLabelProps) {
  const displaySubtitle = cleanSubtitle(label.subtitle);

  return (
    <div
      className={`w-80 p-4 bg-white text-black border border-slate-300 rounded-lg shadow-xs space-y-2 select-none print:shadow-none print:break-inside-avoid ${className}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 m-0 pb-3">
        <div className="space-y-1 min-w-0 flex-1">
          <h4 className="text-xs font-bold text-slate-900 truncate">
            {label.title}
          </h4>
          {displaySubtitle && (
            <p className="text-[10px] text-slate-500 truncate">
              {displaySubtitle}
            </p>
          )}
          <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
            {label.primaryCode}
          </span>
        </div>
        <QRCodeViewer
          value={label.qrPayload}
          size={56}
          className="p-1 border-0"
        />
      </div>

      <div className="flex flex-col items-center justify-center pt-2">
        <BarcodeViewer
          value={label.primaryCode}
          format={format}
          height={45}
          showText
        />
      </div>
    </div>
  );
}
