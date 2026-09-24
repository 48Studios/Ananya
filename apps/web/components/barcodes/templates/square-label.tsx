"use client";

import type { LabelData } from "@/lib/api/barcodes-api";
import { QRCodeViewer } from "../qr-code-viewer";
import { cn } from "@/lib/utils";

export interface SquareLabelProps {
  label: LabelData;
  organizationName: string;
  className?: string;
}

/**
 * Square tag (2" × 2") — organisation and entity type in the header, the item
 * code under a large QR. For a component the item code IS the headline; for
 * every other entity the human title is.
 */
export function SquareLabel({
  label,
  organizationName,
  className = "",
}: SquareLabelProps) {
  return (
    <div
      className={`w-40 h-56 p-3 bg-white text-black border border-slate-300 rounded-lg shadow-xs flex flex-col justify-between items-center select-none print:shadow-none print:border-black print:break-inside-avoid ${className}`}
    >
      <div className="w-full text-center space-y-0.5 border-b border-slate-200 pb-1.5">
        <div className="flex items-center justify-center text-[12px] font-bold uppercase tracking-wider text-slate-500">
          <span className="truncate max-w-[110px]">{organizationName}</span>
        </div>
      </div>

      <div className="flex items-center justify-center w-full h-full">
        <QRCodeViewer
          value={label.qrPayload}
          size={140}
          className="p-1 border-0"
        />
      </div>

      <div className={
        cn("flex items-center w-full text-center border-t border-slate-200 pt-1.5 gap-1.5",
          label.entityType === "COMPONENT" ? "justify-center" : "justify-between"
        )
      }>
        {label.entityType !== "COMPONENT" &&
          <h4
            className="text-xs font-extrabold text-slate-900 leading-tight truncate px-1 text-center"
            title={
              label.title
            }
          >
            {label.title}
          </h4>
        }
        <span className="inline-block font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0">
            {label.primaryCode}
          </span>
      </div>
    </div>
  );
}
