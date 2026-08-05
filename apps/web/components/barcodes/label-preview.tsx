"use client";

import * as React from "react";
import { BarcodeViewer } from "./barcode-viewer";
import { QRCodeViewer } from "./qr-code-viewer";
import { LabelData, BarcodeFormat } from "@/lib/api/barcodes-api";

export type LabelTemplate = "COMPACT" | "STANDARD" | "DETAILED" | "SHELF_BIN";

export interface LabelPreviewProps {
  label: LabelData;
  template?: LabelTemplate;
  format?: BarcodeFormat;
  className?: string;
}

export function LabelPreview({
  label,
  template = "STANDARD",
  format = "CODE128",
  className = "",
}: LabelPreviewProps) {
  if (template === "COMPACT") {
    return (
      <div
        className={`w-64 p-3 bg-white text-black border border-slate-300 rounded-md shadow-xs flex items-center justify-between gap-2 select-none print:shadow-none print:border-black ${className}`}
      >
        <div className="space-y-0.5 min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-900 truncate uppercase">
            {label.title}
          </p>
          <p className="text-[10px] font-mono text-slate-600 truncate font-semibold">
            {label.primaryCode}
          </p>
        </div>
        <QRCodeViewer
          value={label.qrPayload}
          size={48}
          className="p-1 border-0"
        />
      </div>
    );
  }

  if (template === "SHELF_BIN") {
    return (
      <div
        className={`w-80 p-4 bg-white text-black border-2 border-slate-800 rounded-lg shadow-sm space-y-2 select-none print:shadow-none ${className}`}
      >
        <div className="flex items-center justify-between border-b border-slate-300 pb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            LOCATION SHELF / BIN TAG
          </span>
          <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
            {label.primaryCode}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-base font-extrabold text-slate-900 leading-tight">
              {label.title}
            </h4>
            <p className="text-xs font-medium text-slate-600">
              {label.subtitle}
            </p>
          </div>
          <QRCodeViewer
            value={label.qrPayload}
            size={70}
            className="p-1 border-0"
          />
        </div>
      </div>
    );
  }

  if (template === "DETAILED") {
    return (
      <div
        className={`w-96 p-4 bg-white text-black border border-slate-400 rounded-lg shadow-xs space-y-3 select-none print:shadow-none ${className}`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
          <div className="space-y-0.5">
            <h4 className="text-sm font-extrabold text-slate-900 leading-snug">
              {label.title}
            </h4>
            <p className="text-xs text-slate-600">{label.subtitle}</p>
          </div>
          <QRCodeViewer
            value={label.qrPayload}
            size={64}
            className="p-1 border-0"
          />
        </div>

        <div className="flex flex-col items-center justify-center pt-1">
          <BarcodeViewer
            value={label.primaryCode}
            format={format}
            height={55}
            showText
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono border-t border-slate-200 pt-2">
          <span>TYPE: {label.entityType}</span>
          <span>ANANYA ERP IMMUTABLE LABEL</span>
        </div>
      </div>
    );
  }

  // Standard Template (Default)
  return (
    <div
      className={`w-80 p-4 bg-white text-black border border-slate-300 rounded-lg shadow-xs space-y-3 select-none print:shadow-none ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <h4 className="text-xs font-bold text-slate-900 truncate">
            {label.title}
          </h4>
          <p className="text-[11px] font-mono text-slate-600 truncate">
            {label.subtitle}
          </p>
        </div>
        <QRCodeViewer
          value={label.qrPayload}
          size={56}
          className="p-1 border-0"
        />
      </div>

      <div className="flex flex-col items-center justify-center pt-1 border-t border-slate-200">
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
