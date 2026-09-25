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
 *
 * A fixed physical box: 101.6 mm wide × 76.2 mm tall (3" tall × 4" wide, the
 * order {@link TEMPLATE_OPTIONS} writes sizes in). It used to be `w-96` with an
 * auto height, so what the picker promised and what the printer produced had
 * nothing joining them. Header and footer sit on the box edges with the barcode
 * centred between them, so the face fills the sticker at any content length.
 */
export function DetailedLabel({
  label,
  organizationName,
  format = "CODE128",
  className = "",
}: DetailedLabelProps) {
  return (
    <div
      className={`w-[101.6mm] h-[76.2mm] p-4 bg-white text-black border border-slate-400 rounded-lg shadow-xs flex flex-col overflow-hidden select-none print:shadow-none print:break-inside-avoid ${className}`}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h4 className="text-sm font-extrabold text-slate-900 leading-snug line-clamp-2">
            {label.title}
          </h4>
          <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
            {label.primaryCode}
          </span>
        </div>
        <QRCodeViewer
          value={label.qrPayload}
          size={64}
          className="shrink-0 p-1 border-0"
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <BarcodeViewer
          value={label.primaryCode}
          format={format}
          height={55}
          showText
        />
      </div>

      <div className="flex shrink-0 items-center justify-between text-[10px] text-slate-500 font-mono tracking-wider border-t border-slate-200 pt-3">
        <span className="font-bold tracking-wider uppercase truncate">
          {organizationName}
        </span>
        <span>{label.entityType}</span>
      </div>
    </div>
  );
}
