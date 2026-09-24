"use client";

import * as React from "react";
import { Printer, Loader2, AlertCircle, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { LabelPreview } from "./label-preview";
import { LabelTemplate, TEMPLATE_OPTIONS, isQrOnlyTemplate } from "./templates";
import {
  barcodesApi,
  EntityType,
  LabelData,
  BarcodeFormat,
} from "@/lib/api/barcodes-api";

const FORMAT_OPTIONS: Record<BarcodeFormat, string> = {
  CODE128: "Code 128 (High Density)",
  CODE39: "Code 39 (Standard Alphanumeric)",
  EAN13: "EAN-13 (13 Digits)",
  UPCA: "UPC-A (12 Digits)",
};

export interface PrintLabelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: EntityType;
  entityId: string;
  defaultTemplate?: LabelTemplate;
  title?: string;
  initialLabel?: LabelData;
}

export function PrintLabelDialog({
  isOpen,
  onClose,
  entityType,
  entityId,
  defaultTemplate,
  title,
  initialLabel,
}: PrintLabelDialogProps) {
  const [label, setLabel] = React.useState<LabelData | null>(
    initialLabel || null,
  );
  const [loading, setLoading] = React.useState(!initialLabel);
  const [error, setError] = React.useState<string | null>(null);

  const initialTemp: LabelTemplate =
    defaultTemplate ||
    (entityType === "LOCATION" ? "SHELF_BIN" : "STANDARD");

  const [template, setTemplate] = React.useState<LabelTemplate>(initialTemp);
  const [format, setFormat] = React.useState<BarcodeFormat>("CODE128");

  // Fetch or refresh label payload whenever dialog opens
  React.useEffect(() => {
    if (!isOpen || !entityId) return;

    if (defaultTemplate) {
      setTemplate(defaultTemplate);
    } else {
      setTemplate(entityType === "LOCATION" ? "SHELF_BIN" : "STANDARD");
    }

    if (initialLabel && initialLabel.id === entityId) {
      setLabel(initialLabel);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    barcodesApi
      .generatePayload(entityType, entityId)
      .then((data) => {
        if (isMounted) {
          setLabel(data);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const msg =
            err instanceof Error ? err.message : "Failed to generate label payload";
          setError(msg);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, entityType, entityId, defaultTemplate, initialLabel]);

  const handlePrint = () => {
    window.print();
  };

  const dialogTitle =
    title ||
    `Print ${entityType === "LOCATION" ? "Location Tag" : "Component Label"}`;

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={dialogTitle}
      description={`Generate and print high-resolution label with standardized barcode and QR payload.`}
      size="md"
    >
      <DialogShellBody className="space-y-4 print:p-0 print:overflow-visible">
        {/* Header Indicator */}
        <div className="flex items-center gap-2 text-primary print:hidden">
          <Tag className="size-4" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {entityType} LABEL SPECIFICATION
          </span>
          {label && (
            <span className="font-mono text-xs font-bold text-foreground ml-auto bg-muted px-2 py-0.5 rounded">
              {label.primaryCode}
            </span>
          )}
        </div>

        {/* Configuration Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/20 border border-border rounded-lg print:hidden">
          <Field>
            <FieldLabel className="text-xs">Label Template</FieldLabel>
            <Select
              items={TEMPLATE_OPTIONS}
              value={template}
              onValueChange={(val) => setTemplate(val as LabelTemplate)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select template">
                  {(val) => TEMPLATE_OPTIONS[val as LabelTemplate] || val}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEMPLATE_OPTIONS).map(([val, name]) => (
                  <SelectItem key={val} value={val}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel className="text-xs">
              Barcode Format
              {isQrOnlyTemplate(template) && (
                <span className="text-[10px] text-muted-foreground font-normal ml-1">
                  (QR-only template)
                </span>
              )}
            </FieldLabel>
            <Select
              items={FORMAT_OPTIONS}
              value={format}
              disabled={isQrOnlyTemplate(template)}
              onValueChange={(val) => setFormat(val as BarcodeFormat)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select format">
                  {(val) => FORMAT_OPTIONS[val as BarcodeFormat] || val}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FORMAT_OPTIONS).map(([val, name]) => (
                  <SelectItem key={val} value={val}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Live Vector Label Preview Container */}
        <div className="min-h-[220px] rounded-xl border border-border bg-muted/10 p-6 flex flex-col items-center justify-center print:min-h-0 print:border-0 print:bg-transparent print:p-0 print:items-start">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-xs text-muted-foreground print:hidden">
              <Loader2 className="w-4 h-4 mr-2 animate-spin text-primary" />
              Rendering label template & QR payload...
            </div>
          ) : error ? (
            <div className="p-4 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 print:hidden">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : label ? (
            <div className="flex justify-center print:justify-start w-full">
              <LabelPreview
                label={label}
                template={template}
                format={format}
              />
            </div>
          ) : null}
        </div>
      </DialogShellBody>

      <DialogShellFooter className="print:hidden">
        <DialogShellCancelButton />
        <Button
          size="sm"
          disabled={loading || !label}
          onClick={handlePrint}
        >
          <Printer className="mr-1.5 size-4" />
          Print Label
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
