"use client";

import type { LabelData } from "@/lib/api/barcodes-api";
import { QRCodeViewer } from "../qr-code-viewer";

export interface QrCode2InchLabelProps {
  label: LabelData;
  organizationName: string;
  className?: string;
}

/**
 * QR Code (2 Inch x 1.25 Inch) — organisation in the header, a large QR, the
 * item code underneath. For a component the item code IS the headline; for
 * every other entity the human title sits beside it.
 *
 * A portrait face: 32 mm wide × 50.8 mm tall, i.e. two inches tall. It absorbed
 * the former `QR_ONLY` template, which was the same idea with less on it, so
 * there is one QR template at this size and one picker entry.
 */
export function QrCode2InchLabel({
  label,
  organizationName,
  className = "",
}: QrCode2InchLabelProps) {
  return (
    <div
      className={`w-[32mm] h-[50.8mm] p-3 bg-white text-black border border-slate-300 rounded-lg shadow-xs flex flex-col justify-between items-center select-none print:shadow-none print:border-black print:break-inside-avoid ${className}`}
    >
      <div className="w-full text-center border-b border-slate-200 pb-1.5">
        <div className="flex items-center justify-center text-[12px] font-bold uppercase tracking-wider text-slate-500">
          <span className="truncate max-w-[110px]">{organizationName}</span>
        </div>
      </div>

      <div className="flex items-center justify-center w-full h-full">
        <QRCodeViewer
          value={label.qrPayload}
          size={110}
          className="p-1 border-0"
        />
      </div>

      <div className="flex items-center justify-center w-full text-center border-t border-slate-200 pt-1.5">
        <span className="inline-block font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0">
          {label.primaryCode}
        </span>
      </div>
    </div>
  );
}
