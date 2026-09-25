"use client";

import type { LabelData } from "@/lib/api/barcodes-api";
import { QRCodeViewer } from "../qr-code-viewer";

export interface CompactLabelProps {
  label: LabelData;
  className?: string;
  organizationName?: string;
}

/**
 * Compact label (1" × 2") — title and item code beside a small QR, for rack
 * edges and tight spaces. The 1/2" tall variant of the same face is
 * {@link CompactHalfInchLabel}.
 *
 * A fixed physical box: 50.8 mm wide × 25.4 mm tall (1" tall × 2" wide, the
 * order {@link TEMPLATE_OPTIONS} writes sizes in). It used to be `w-64` — a
 * 67.7 mm wide face under a name that said 2 inch, which no 1" × 2" sticker
 * could hold.
 */
export function CompactLabel({ label, className = "", organizationName }: CompactLabelProps) {
  return (
    <div
      className={`w-[50.8mm] h-[25.4mm] p-3 pr-2 bg-white text-black border border-slate-300 rounded-md shadow-xs flex items-center justify-between gap-2 overflow-hidden select-none print:shadow-none print:border-black print:break-inside-avoid ${className}`}
    >
      <div className="space-y-0.5 min-w-0 flex-1">
        {organizationName && (
          <p className="text-[10px] font-bold text-slate-500 truncate border-b border-slate-200 pb-1 mb-1">
            {organizationName}
          </p>
        )}
        <p className="text-[10px] font-bold text-slate-900 truncate uppercase">
          {label.title}
        </p>
        <span className="inline-block font-mono text-[10px] font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0">
          {label.primaryCode}
        </span>
      </div>
      <QRCodeViewer
        value={label.qrPayload}
        size={65}
        className="shrink-0 !p-0 border-0"
      />
    </div>
  );
}
