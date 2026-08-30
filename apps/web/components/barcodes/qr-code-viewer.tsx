"use client";

import * as React from "react";
import QRCode from "qrcode";

export interface QRCodeViewerProps {
  value: string;
  size?: number;
  className?: string;
}

export function QRCodeViewer({
  value,
  size = 120,
  className = "",
}: QRCodeViewerProps) {
  const qr = React.useMemo(() => {
    try {
      return QRCode.create(value || "ANANYA", {
        errorCorrectionLevel: "M",
      });
    } catch {
      return QRCode.create("ANANYA", { errorCorrectionLevel: "M" });
    }
  }, [value]);

  const moduleCount = qr.modules.size;
  const margin = 4; // Standard ISO 4-module quiet zone
  const totalSize = moduleCount + margin * 2;

  // Build crisp integer-coordinate vector path
  const pathData = React.useMemo(() => {
    let d = "";
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.modules.get(r, c)) {
          d += `M${c + margin},${r + margin}h1v1h-1z `;
        }
      }
    }
    return d;
  }, [qr, moduleCount]);

  return (
    <div
      className={`inline-block select-none bg-white p-1 rounded-lg border border-border print:border-0 print:p-0 ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${totalSize} ${totalSize}`}
        className="block"
        shapeRendering="crispEdges"
      >
        <rect width={totalSize} height={totalSize} fill="#ffffff" />
        <path d={pathData} fill="#000000" />
      </svg>
    </div>
  );
}


