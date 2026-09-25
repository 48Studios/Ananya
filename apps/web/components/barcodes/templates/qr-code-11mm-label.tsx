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
 * payload rather than the scanner URL the shared viewer builds by default: at
 * this size that is 41 modules instead of 49. Every other face has the room and
 * keeps the URL, which is what lets a phone's own camera open the record. Here
 * the trade goes the other way, because the module is already at the edge of
 * what a 203 dpi printer can hold (0.182 mm) — and the label carries its human
 * code under the QR, so it stays usable without a scan. The in-app scanner
 * resolves either form.
 *
 * THE QR IS SIZED BY THE BOX, NOT BY A PIXEL SIZE. The inner width here is
 * 8 mm − 2 × 1 px border = 7.47 mm, and the QR fills exactly that. A fixed
 * `size` cannot express it: 30 px is 7.94 mm, i.e. 0.23 mm proud on each side,
 * which only looked right on screen because the wrapper clipped it. Print is
 * where that clip is not honoured, so the code came out running over the border
 * — the box is the size authority on a sticker, and the stretch classes on the
 * viewer's SVG hand it the same guarantee the other measured faces get from
 * their box: nothing overflows, so nothing has to be clipped. The divider below
 * is a budget taken out of that: an 11 mm box whose QR is capped by the 7.47 mm
 * width leaves it ~2.7 mm, or the QR starts being height-limited instead.
 */
export function QrCode11MmLabel({
  label,
  className = "",
}: QrCode11MmLabelProps) {
  return (
    <div
      className={`w-[8mm] h-[11mm] p-0 bg-white text-black border border-slate-300 rounded-xs shadow-xs flex flex-col justify-between items-center overflow-hidden select-none print:shadow-none print:border-black print:break-inside-avoid ${className}`}
    >
      {/* `flex-1 min-h-0` takes the space the divider leaves, so the QR area is
          a consequence of the box rather than a percentage that has to shrink
          to fit it. */}
      <div className="flex flex-1 min-h-0 items-center justify-center w-full overflow-hidden">
        <QRCodeViewer
          value={label.qrPayload}
          size={30}
          ensureActionableUrl={false}
          className="!p-0 border-0 w-full h-full [&>svg]:w-full [&>svg]:h-full"
        />
      </div>

      <div className="flex shrink-0 items-center justify-center w-full text-center border-t border-slate-200 h-[10px]">
        <span className="inline-block font-mono text-[3.5px] font-bold">
          {label.primaryCode}
        </span>
      </div>
    </div>
  );
}
