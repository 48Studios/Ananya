"use client";

import * as React from "react";
import { LabelData, BarcodeFormat } from "@/lib/api/barcodes-api";
import { settingsApi } from "@/lib/api/settings-api";
import {
  CompactHalfInchLabel,
  CompactLabel,
  DetailedLabel,
  QrCode11MmLabel,
  QrCode1InchLabel,
  QrCode2InchLabel,
  ShelfBinLabel,
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

  if (template === "COMPACT") {
    return <CompactLabel label={label} className={className} organizationName={orgName} />;
  }

  if (template === "COMPACT_HALF_INCH") {
    return <CompactHalfInchLabel label={label} className={className} organizationName={orgName} />;
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

  if (template === "QR_CODE_2_INCH") {
    return (
      <QrCode2InchLabel
        label={label}
        organizationName={orgName}
        className={className}
      />
    );
  }

  if (template === "QR_CODE_1_INCH") {
    return (
      <QrCode1InchLabel
        label={label}
        organizationName={orgName}
        className={className}
      />
    );
  }

  if (template === "QR_CODE_11MM") {
    return <QrCode11MmLabel label={label} className={className} />;
  }

  // Standard Template (Default)
  return <StandardLabel label={label} format={format} className={className} />;
}
