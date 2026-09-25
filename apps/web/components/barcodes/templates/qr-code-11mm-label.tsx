"use client";

import type { LabelData } from "@/lib/api/barcodes-api";
import { QRCodeViewer } from "../qr-code-viewer";

export interface QrCode11MmLabelProps {
  label: LabelData;
  className?: string;
}

/**
 * QR Code (11 MM x 8 MM) — a small QR, the item code underneath. For a
 * component the item code IS the headline; for every other entity the human
 * title sits beside it.
 *
 * A portrait face: 8 mm wide × 11 mm tall. It is the one face small enough for
 * the payload to decide whether the code prints at all, so it encodes the RAW
 * payload rather than the scanner URL the shared viewer builds by default: on a
 * 7 mm square that is 41 modules instead of 49, i.e. 0.171 mm per module rather
 * than 0.143. Every other face has the room and keeps the URL, which is what
 * lets a phone's own camera open the record. Here the trade goes the other way,
 * because a module below ~0.25 mm is at the edge of what a 203 dpi printer can
 * hold — and the label carries its human code beside the QR, so it stays usable
 * without a scan. The in-app scanner resolves either form.
 */
export function QrCode11MmLabel({
  label,
  className = "",
}: QrCode11MmLabelProps) {
  return (
    <div
      className={`w-[8mm] h-[11mm] p-0 bg-white text-black border border-slate-300 rounded-xs shadow-xs flex flex-col justify-between items-center select-none print:shadow-none print:border-black print:break-inside-avoid ${className}`}
    >
      <div className="flex items-center justify-center w-full h-full">
        <QRCodeViewer
          value={label.qrPayload}
          size={26}
          ensureActionableUrl={false}
          className="!p-0 border-0"
        />
      </div>

      <div className="flex items-center justify-center w-full text-center border-t border-slate-200 h-[12px]">
        <span className="inline-block font-mono text-[3.5px] font-bold">
          {label.primaryCode}
        </span>
      </div>
    </div>
  );
}
