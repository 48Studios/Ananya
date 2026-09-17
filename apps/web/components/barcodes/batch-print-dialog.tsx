"use client";

import * as React from "react";
import { Printer, Loader2, AlertCircle } from "lucide-react";
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
import { LabelPreview, LabelTemplate } from "./label-preview";
import {
  barcodesApi,
  EntityType,
  LabelData,
  BarcodeFormat,
} from "@/lib/api/barcodes-api";

const TEMPLATE_OPTIONS: Record<LabelTemplate, string> = {
  STANDARD: 'Standard (2" x 4")',
  COMPACT: 'Compact (1" x 2")',
  DETAILED: 'Detailed (3" x 4")',
  SHELF_BIN: "Shelf Bin Tag",
  SQUARE: 'Square Tag (2" x 2")',
};

const FORMAT_OPTIONS: Record<BarcodeFormat, string> = {
  CODE128: "Code 128 (High Density)",
  CODE39: "Code 39 (Standard Alphanumeric)",
  EAN13: "EAN-13 (13 Digits)",
  UPCA: "UPC-A (12 Digits)",
};

export interface BatchPrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: EntityType;
  entityIds: string[];
  title?: string;
}

export function BatchPrintDialog({
  isOpen,
  onClose,
  entityType,
  entityIds,
  title = "Batch Label Print Studio",
}: BatchPrintDialogProps) {
  const [labels, setLabels] = React.useState<LabelData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [template, setTemplate] = React.useState<LabelTemplate>("STANDARD");
  const [format, setFormat] = React.useState<BarcodeFormat>("CODE128");

  const fetchBatchLabels = React.useCallback(async () => {
    if (!isOpen || entityIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await barcodesApi.getBatchLabels({
        entityType,
        ids: entityIds,
      });
      setLabels(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to generate batch label print queue.");
      }
    } finally {
      setLoading(false);
    }
  }, [isOpen, entityType, entityIds]);

  React.useEffect(() => {
    fetchBatchLabels();
  }, [fetchBatchLabels]);

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={title}
      description={`Review and print ${entityIds.length} ${entityType.toLowerCase()} label(s) with standardized barcode output settings.`}
      size="lg"
    >
      <DialogShellBody className="space-y-4 print:p-0 print:overflow-visible">
        <div className="flex items-center gap-2 text-primary print:hidden">
          <Printer className="size-5" />
          <span className="text-sm font-medium text-foreground">
            Printing {entityIds.length} {entityType.toLowerCase()} label(s)
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-2 print:hidden">
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
                {Object.entries(TEMPLATE_OPTIONS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel className="text-xs">
              Barcode Format
              {(template === "COMPACT" || template === "SHELF_BIN" || template === "SQUARE") && (
                <span className="text-[10px] text-muted-foreground font-normal ml-1">
                  (QR-only template)
                </span>
              )}
            </FieldLabel>
            <Select
              items={FORMAT_OPTIONS}
              value={format}
              disabled={template === "COMPACT" || template === "SHELF_BIN" || template === "SQUARE"}
              onValueChange={(val) => setFormat(val as BarcodeFormat)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select format">
                  {(val) => FORMAT_OPTIONS[val as BarcodeFormat] || val}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FORMAT_OPTIONS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="min-h-[300px] rounded-xl border border-border bg-muted/10 p-4 print:min-h-0 print:border-0 print:bg-transparent print:p-0">
          {loading ? (
            <div className="h-full flex items-center justify-center p-8 text-xs text-muted-foreground print:hidden">
              <Loader2 className="w-4 h-4 mr-2 animate-spin text-primary" />
              Generating barcode & QR label queue...
            </div>
          ) : error ? (
            <div className="p-4 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 print:hidden">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4 justify-center print:gap-4 print:justify-start">
              {labels.map((lbl) => (
                <LabelPreview
                  key={lbl.id}
                  label={lbl}
                  template={template}
                  format={format}
                />
              ))}
            </div>
          )}
        </div>
      </DialogShellBody>
      <DialogShellFooter className="print:hidden">
        <span className="mr-auto text-xs font-mono text-muted-foreground">
          Ready to print {labels.length} label(s)
        </span>
        <DialogShellCancelButton />
        <Button
          size="sm"
          disabled={loading || labels.length === 0}
          onClick={() => window.print()}
        >
          <Printer className="mr-1.5 size-4" />
          Print Labels
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
