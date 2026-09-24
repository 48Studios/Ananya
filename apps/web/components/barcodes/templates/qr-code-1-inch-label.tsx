"use client";

import type { LabelData } from "@/lib/api/barcodes-api";
import { QRCodeViewer } from "../qr-code-viewer";

export interface QrCode1InchLabelProps {
  label: LabelData;
  organizationName: string;
  className?: string;
}

/**
 * QR Code (1 Inch) — organisation in the header, a medium QR, the item code
 * underneath. For a component the item code IS the headline; for every other
 * entity the human title sits beside it.
 *
 * This is the merged face. It absorbed the former `QR_ONLY` template, which was
 * the same idea with less on it: one QR template at this size, one picker
 * entry. The minimal-QR case is {@link QrCode11MmLabel} instead.
 */
export function QrCode1InchLabel({
  label,
  organizationName,
  className = "",
}: QrCode1InchLabelProps) {
  return (
    <div
      className={`w-[16mm] h-[25.4mm] p-1.5 bg-white text-black border border-slate-300 rounded-md shadow-xs flex flex-col justify-between items-center select-none print:shadow-none print:border-black print:break-inside-avoid ${className}`}
    >
      <div className="w-full text-center border-b border-slate-200 pb-1">
        <div className="flex items-center justify-center text-[4px] font-bold uppercase tracking-wider text-slate-500">
          <span className="truncate max-w-[110px]">{organizationName}</span>
        </div>
      </div>

      <div className="flex items-center justify-center w-full h-full">
        <QRCodeViewer
          value={label.qrPayload}
          size={50}
          className="p-1 border-0"
        />
      </div>

      <div className="flex items-center justify-center w-full text-center border-t border-slate-200 pt-1">
        <span className="inline-block font-mono text-[6px] font-bold">
          {label.primaryCode}
        </span>
      </div>
    </div>
  );
}
