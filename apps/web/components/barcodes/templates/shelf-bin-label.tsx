"use client";

import type { LabelData } from "@/lib/api/barcodes-api";
import { QRCodeViewer } from "../qr-code-viewer";
import { cleanSubtitle } from "./label-text";

export interface ShelfBinLabelProps {
  label: LabelData;
  organizationName: string;
  className?: string;
}

/**
 * Shelf bin tag (3" × 1.5") — where a thing lives, in the largest type, so it
 * can be read while walking the aisle.
 *
 * `attribute1` carries the storage path for a component and the location name
 * for a location, which is why it is consulted before the entity type.
 */
export function ShelfBinLabel({
  label,
  organizationName,
  className = "",
}: ShelfBinLabelProps) {
  let locationText = "";
  if (label.attribute1) {
    locationText = label.attribute1;
  } else if (label.entityType === "LOCATION") {
    locationText = label.title;
  } else {
    locationText = "STORAGE LOCATION";
  }
  const locationDisplay = cleanSubtitle(locationText).toUpperCase();

  return (
    <div
      className={`w-80 p-4 bg-white text-black border-2 border-slate-800 rounded-lg shadow-sm space-y-2 select-none print:shadow-none print:break-inside-avoid ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-300 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <span className="truncate max-w-[110px]">{organizationName}</span>
        <span className="truncate">{locationDisplay}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1 min-w-0 flex-1">
          <h4 className="text-base font-extrabold text-slate-900 leading-tight">
            {label.title}
          </h4>
          <span className="inline-block font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
            {label.primaryCode}
          </span>
        </div>
        <QRCodeViewer
          value={label.qrPayload}
          size={70}
          className="p-1 border-0 shrink-0"
        />
      </div>
    </div>
  );
}
