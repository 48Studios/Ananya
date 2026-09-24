"use client";

import * as React from "react";
import { LabelData, BarcodeFormat } from "@/lib/api/barcodes-api";
import { settingsApi } from "@/lib/api/settings-api";
import {
  CompactLabel,
  DetailedLabel,
  MiniQrLabel,
  QrOnlyLabel,
  ShelfBinLabel,
  SquareLabel,
  StandardLabel,
  type LabelTemplate,
} from "./templates";

export interface LabelPreviewProps {
  label: LabelData;
  template?: LabelTemplate;
  format?: BarcodeFormat;
  organizationName?: string;
  className?: string;
}

/**
 * Dispatcher for the label studio: resolves the organisation once, then renders
 * the template face the caller chose.
 *
 * Every face lives in `./templates`, one file per template. The registry in
 * `./templates/registry.ts` is the single place a template is declared, and
 * `TEMPLATE_OPTIONS` there is a total record of the union, so adding a template
 * fails to compile until its picker label exists.
 */
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

  if (template === "QR_ONLY") {
    return <QrOnlyLabel label={label} className={className} />;
  }

  if (template === "SQUARE") {
    return (
      <SquareLabel
        label={label}
        organizationName={orgName}
        className={className}
      />
    );
  }

  if (template === "COMPACT") {
    return <CompactLabel label={label} className={className} />;
  }

  if (template === "SHELF_BIN") {
    return (
      <ShelfBinLabel
        label={label}
        organizationName={orgName}
        className={className}
      />
    );
  }

  if (template === "DETAILED") {
    return (
      <DetailedLabel
        label={label}
        organizationName={orgName}
        format={format}
        className={className}
      />
    );
  }

  if (template === "MINI_QR") {
    return <MiniQrLabel label={label} className={className} />;
  }

  // Standard Template (Default)
  return <StandardLabel label={label} format={format} className={className} />;
}
