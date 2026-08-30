"use client";

import * as React from "react";
import { BarcodeViewer } from "./barcode-viewer";
import { QRCodeViewer } from "./qr-code-viewer";
import { LabelData, BarcodeFormat } from "@/lib/api/barcodes-api";
import { settingsApi } from "@/lib/api/settings-api";

export type LabelTemplate = "COMPACT" | "STANDARD" | "DETAILED" | "SHELF_BIN";

export interface LabelPreviewProps {
  label: LabelData;
  template?: LabelTemplate;
  format?: BarcodeFormat;
  organizationName?: string;
  className?: string;
}

function cleanSubtitle(text?: string): string {
  if (!text) return "";
  return text
    .replace(/\|\s*Unit:\s*[^|]+/gi, "")
    .replace(/Unit:\s*[^|]+/gi, "")
    .replace(/\|\s*Units:\s*[^|]+/gi, "")
    .replace(/\s+units?\b/gi, "")
    .replace(/\s*\|\s*$/, "")
    .replace(/^\s*\|\s*/, "")
    .trim();
}

export function LabelPreview({
  label,
  template = "STANDARD",
  format = "CODE128",
  organizationName,
  className = "",
}: LabelPreviewProps) {
  const [orgName, setOrgName] = React.useState<string>(
    organizationName || "48 Studios",
  );

  React.useEffect(() => {
    if (organizationName) {
      setOrgName(organizationName);
      return;
    }
    settingsApi
      .getOrganizationProfile()
      .then((profile) => {
        if (profile?.companyName) {
          setOrgName(profile.companyName);
        }
      })
      .catch(() => { });
  }, [organizationName]);

  const displaySubtitle = cleanSubtitle(label.subtitle);

  if (template === "COMPACT") {
    return (
      <div
        className={`w-64 p-3 bg-white text-black border border-slate-300 rounded-md shadow-xs flex items-center justify-between gap-2 select-none print:shadow-none print:border-black print:break-inside-avoid ${className}`}
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
        <div className="flex items-center justify-between border-b border-slate-300 pb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 truncate">
            {locationDisplay}
          </span>
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

  if (template === "DETAILED") {
    return (
      <div
        className={`w-96 p-4 bg-white text-black border border-slate-400 rounded-lg shadow-xs gap-2 select-none print:shadow-none print:break-inside-avoid ${className}`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
          <div className="space-y-0.5">
            <h4 className="text-sm font-extrabold text-slate-900 leading-snug">
              {label.title}
            </h4>
            <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
              {label.primaryCode}
            </span>
          </div>
          <QRCodeViewer
            value={label.qrPayload}
            size={64}
            className="p-1 border-0"
          />
        </div>

        <div className="flex flex-col items-center justify-center mb-3 mt-1">
          <BarcodeViewer
            value={label.primaryCode}
            format={format}
            height={55}
            showText
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono border-t border-slate-200 pt-3">
          <span className="font-bold tracking-wider uppercase truncate">{orgName}</span>
          <span>TYPE: {label.entityType}</span>
        </div>
      </div>
    );
  }

  // Standard Template (Default)
  return (
    <div
      className={`w-80 p-4 bg-white text-black border border-slate-300 rounded-lg shadow-xs space-y-2 select-none print:shadow-none print:break-inside-avoid ${className}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 m-0 pb-3">
        <div className="space-y-1 min-w-0 flex-1">
          <h4 className="text-xs font-bold text-slate-900 truncate">
            {label.title}
          </h4>
          {displaySubtitle && (
            <p className="text-[10px] text-slate-500 truncate">{displaySubtitle}</p>
          )}
          <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
            {label.primaryCode}
          </span>
        </div>
        <QRCodeViewer
          value={label.qrPayload}
          size={56}
          className="p-1 border-0"
        />
      </div>

      <div className="flex flex-col items-center justify-center pt-2">
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
