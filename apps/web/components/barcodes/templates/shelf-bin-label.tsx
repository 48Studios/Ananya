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
 * Shelf bin tag (1.5" × 3") — where a thing lives, in the largest type, so it
 * can be read while walking the aisle.
 *
 * A fixed physical box: 76.2 mm wide × 38.1 mm tall (1.5" tall × 3" wide, the
 * order {@link TEMPLATE_OPTIONS} writes sizes in — which is why the picker
 * states the size that way round too). It used to be `w-80` with an auto height,
 * so the 3" edge was 84.7 mm and the 1.5" edge was whatever the content came to.
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
      className={`w-[76.2mm] h-[38.1mm] p-3 bg-white text-black border-2 border-slate-800 rounded-lg shadow-sm flex flex-col overflow-hidden select-none print:shadow-none print:break-inside-avoid ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-300 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <span className="truncate max-w-[110px]">{organizationName}</span>
        <span className="truncate">{locationDisplay}</span>
      </div>
      <div className="flex flex-1 items-center justify-between gap-4">
        <div className="space-y-1 min-w-0 flex-1">
          <h4 className="text-base font-extrabold text-slate-900 leading-tight line-clamp-2">
            {label.title}
          </h4>
          <span className="inline-block font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
            {label.primaryCode}
          </span>
        </div>
        <QRCodeViewer
          value={label.qrPayload}
          size={64}
          className="shrink-0 p-1 border-0"
        />
      </div>
    </div>
  );
}
