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
 *
 * A fixed physical box: 101.6 mm wide × 50.8 mm tall (2" tall × 4" wide, the
 * order {@link TEMPLATE_OPTIONS} writes sizes in). It used to be `w-80` with an
 * auto height — 84.7 mm of face under a name that said 4 inch. The barcode is
 * centred in the space the header leaves, so the face fills the sticker.
 */
export function StandardLabel({
  label,
  format = "CODE128",
  className = "",
}: StandardLabelProps) {
  const displaySubtitle = cleanSubtitle(label.subtitle);

  return (
    <div
      className={`w-[101.6mm] h-[50.8mm] p-4 bg-white text-black border border-slate-300 rounded-lg shadow-xs flex flex-col overflow-hidden select-none print:shadow-none print:break-inside-avoid ${className}`}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 m-0 pb-3">
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
          className="shrink-0 p-1 border-0"
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
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
