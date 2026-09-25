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
import { Input } from "@/components/ui/input";
import { settingsApi } from "@/lib/api/settings-api";
import { clampLabelCopies, totalLabelCount } from "@/lib/bulk-actions";
import { printLabelDocument } from "@/lib/print/print-document";
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
  // Copies per label. A bin label is usually printed twice (shelf + record), so
  // the queue is stated as "X labels × N copies" before anything is sent to the
  // printer instead of silently repeating the sheet.
  const [copies, setCopies] = React.useState(1);

  /**
   * Holds the rendered label faces, one per label. The print document is built
   * from these elements, so the sheet is exactly the queue that was reviewed.
   */
  const labelSheetRef = React.useRef<HTMLDivElement | null>(null);

  // Resolved once here and handed to every face: a face would otherwise fetch
  // the organisation profile per instance, and the print block can hold
  // hundreds of instances.
  const [organizationName, setOrganizationName] = React.useState<
    string | undefined
  >(undefined);

  React.useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    settingsApi
      .getOrganizationProfile()
      .then((profile) => {
        if (isMounted && profile?.companyName) {
          setOrganizationName(profile.companyName);
        }
      })
      .catch(() => {
        // The faces fall back to their own default name.
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

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

  const handlePrint = () => {
    const faces = Array.from(labelSheetRef.current?.children ?? []).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    if (faces.length === 0) return;

    // Copies are a sheet concern, not a preview concern: the on-screen queue
    // stays one face per label while the print sheet repeats each face, so the
    // two can never disagree about what was reviewed.
    void printLabelDocument({
      sources: faces.map((node) => ({ node, copies })),
    });
  };

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

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-3 print:hidden">
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
                {Object.entries(FORMAT_OPTIONS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel className="text-xs">Copies per Label</FieldLabel>
            <Input
              type="number"
              min={1}
              max={99}
              value={copies}
              onChange={(event) =>
                setCopies(clampLabelCopies(Number(event.target.value)))
              }
              className="h-8 text-xs"
              aria-label="Copies per label"
            />
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
            // Screen queue: one face per label. The printed sheet adds copies.
            <div
              ref={labelSheetRef}
              className="flex flex-wrap gap-4 justify-center"
            >
              {labels.map((lbl) => (
                <LabelPreview
                  key={lbl.id}
                  label={lbl}
                  template={template}
                  format={format}
                  organizationName={organizationName}
                />
              ))}
            </div>
          )}
        </div>
      </DialogShellBody>
      <DialogShellFooter className="print:hidden">
        <span className="mr-auto text-xs font-mono text-muted-foreground">
          Ready to print {labels.length} label(s)
          {copies > 1
            ? ` \u00d7 ${copies} copies = ${totalLabelCount(labels.length, copies)} labels`
            : ""}
        </span>
        <DialogShellCancelButton />
        <Button
          size="sm"
          disabled={loading || labels.length === 0}
          onClick={handlePrint}
        >
          <Printer className="mr-1.5 size-4" />
          Print Labels
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
