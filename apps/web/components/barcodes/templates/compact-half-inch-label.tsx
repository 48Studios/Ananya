"use client";

import type { LabelData } from "@/lib/api/barcodes-api";
import { QRCodeViewer } from "../qr-code-viewer";

export interface CompactHalfInchLabelProps {
  label: LabelData;
  className?: string;
  organizationName?: string;
}

/**
 * Compact Half-Inch (0.5" × 1.5") — {@link CompactLabel}'s content at half the
 * height: title and item code beside a small QR. For rack edges too shallow for
 * the 1" tall tag.
 *
 * A fixed physical box: 38.1 mm wide × 12.7 mm tall (0.5" tall × 1.5" wide, the
 * order {@link TEMPLATE_OPTIONS} writes sizes in). Nothing is dropped at this
 * size — only the type steps down — so the QR carries the same payload as every
 * other face. The QR is padded with an inline style rather than a class: the
 * viewer's own chrome wins over a same-specificity class, and at this box a
 * stray 4 px of padding is a third of the height.
 */
export function CompactHalfInchLabel({
  label,
  className = "",
  organizationName,
}: CompactHalfInchLabelProps) {
  return (
    <div
      className={`w-[38.1mm] h-[12.7mm] p-1 pl-1.5 bg-white text-black border border-slate-300 rounded-xs shadow-xs flex items-center justify-between gap-1 overflow-hidden select-none print:shadow-none print:border-black print:break-inside-avoid ${className}`}
    >
      <div className="space-y-px min-w-0 flex-1">
        {organizationName && (
          <p className="text-[5px] font-bold text-slate-500 truncate border-b border-b-[0.5px] border-slate-200 pb-0.5 mb-1">
            {organizationName}
          </p>
        )}
        <p className="text-[6px] leading-[7px] font-bold text-slate-900 truncate uppercase">
          {label.title}
        </p>
        <p className="text-[5px] leading-[6px] font-mono text-slate-600 truncate font-semibold">
          {label.primaryCode}
        </p>
      </div>
      <QRCodeViewer
        value={label.qrPayload}
        size={40}
        className="shrink-0 border-0 !p-0"
      />
    </div>
  );
}
