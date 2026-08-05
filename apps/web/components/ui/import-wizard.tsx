"use client";

import * as React from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Download,
  Loader2,
  X,
  FileCheck,
} from "lucide-react";
import {
  importExportApi,
  ImportPreviewResultDto,
} from "@/lib/api/import-export-api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  onImportComplete?: () => void;
}

export function ImportWizard({
  isOpen,
  onClose,
  entityType,
  onImportComplete,
}: ImportWizardProps) {
  const [step, setStep] = React.useState<1 | 2 | 3 | 4 | 5>(1);
  const [previewData, setPreviewData] =
    React.useState<ImportPreviewResultDto | null>(null);
  const [columnMapping, setColumnMapping] = React.useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = React.useState(false);
  const [executionResult, setExecutionResult] = React.useState<{
    total: number;
    failed: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      setLoading(true);
      setErrorMsg(null);
      try {
        const preview = await importExportApi.previewImport(entityType, text);
        setPreviewData(preview);
        setColumnMapping(preview.columnMapping);
        setStep(2);
      } catch (err: unknown) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to parse file",
        );
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = async () => {
    try {
      const template = await importExportApi.getTemplate(entityType);
      const csv = [
        template.headers.join(","),
        Object.values(template.sampleRow)
          .map((v) => `"${v}"`)
          .join(","),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entityType.toLowerCase()}_import_template.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const handleExecuteImport = async () => {
    if (!previewData) return;
    setLoading(true);
    setStep(4);
    try {
      const job = await importExportApi.executeImport(
        entityType,
        columnMapping,
        previewData.sampleRows,
      );
      setExecutionResult({
        total: job.totalRecords,
        failed: job.failedRecords,
      });
      setStep(5);
      if (onImportComplete) onImportComplete();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Import execution failed",
      );
      setStep(3);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pt-10 px-4 animate-in fade-in-0 duration-150">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Import {entityType} Wizard
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Steps Indicator */}
        <div className="flex items-center justify-between text-xs font-mono border-b border-border pb-3 text-muted-foreground">
          <span className={step >= 1 ? "text-primary font-bold" : ""}>
            1. Upload File
          </span>
          <span>→</span>
          <span className={step >= 2 ? "text-primary font-bold" : ""}>
            2. Column Mapping
          </span>
          <span>→</span>
          <span className={step >= 3 ? "text-primary font-bold" : ""}>
            3. Validation
          </span>
          <span>→</span>
          <span className={step >= 5 ? "text-primary font-bold" : ""}>
            4. Complete
          </span>
        </div>

        {errorMsg && (
          <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: Upload File */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-8 text-center bg-muted/20 transition-all flex flex-col items-center justify-center gap-3">
              <Upload className="w-10 h-10 text-muted-foreground/60" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Upload CSV or Excel file
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Drag and drop your spreadsheet or click to browse
                </p>
              </div>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload">
                <Button variant="outline" size="sm" className="cursor-pointer">
                  Browse File
                </Button>
              </label>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Need a starting template?
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadTemplate}
                className="text-xs text-primary"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Download Sample Template
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Preview & Column Mapping */}
        {step === 2 && previewData && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs bg-muted/30 p-2.5 rounded-lg border border-border">
              <span>
                Total Spreadsheet Rows: <strong>{previewData.totalRows}</strong>
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                Valid: {previewData.validRowsCount}
              </span>
              {previewData.invalidRowsCount > 0 && (
                <span className="text-destructive font-semibold">
                  Errors: {previewData.invalidRowsCount}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">
                Column Mapping
              </label>
              <div className="max-h-48 overflow-y-auto space-y-2 border border-border rounded-lg p-3 bg-muted/10">
                {previewData.headers.map((h) => (
                  <div
                    key={h}
                    className="flex items-center justify-between text-xs gap-3"
                  >
                    <span className="font-mono text-muted-foreground w-1/3 truncate">
                      {h}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <Select
                      value={columnMapping[h] || "IGNORE"}
                      onValueChange={(val) =>
                        setColumnMapping({
                          ...columnMapping,
                          [h]: !val || val === "IGNORE" ? "" : val,
                        })
                      }
                    >
                      <SelectTrigger className="w-1/2 h-8 text-xs">
                        <SelectValue placeholder="Ignore Column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IGNORE">
                          -- Ignore Column --
                        </SelectItem>
                        {previewData.systemFields.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
                disabled={loading}
              >
                Back
              </Button>
              <Button size="sm" onClick={() => setStep(3)} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : null}
                Validate & Next
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Validation Summary */}
        {step === 3 && previewData && (
          <div className="space-y-4">
            <div className="p-4 bg-muted/20 border border-border rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <FileCheck className="w-4 h-4 text-emerald-500" />
                <span>Pre-Import Validation Check</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Ready to import {previewData.validRowsCount} valid records into{" "}
                {entityType} database repository.
              </p>
              {previewData.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1.5 border border-destructive/20 bg-destructive/5 p-2.5 rounded-lg text-[11px] text-destructive">
                  {previewData.errors.map((e, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>
                        Row {e.row}: {e.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                Back to Mapping
              </Button>
              <Button size="sm" onClick={handleExecuteImport}>
                Confirm & Import
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Execution Progress */}
        {step === 4 && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
            <p className="text-xs font-semibold text-foreground">
              Executing Batch Import...
            </p>
            <p className="text-xs text-muted-foreground">
              Persisting records inside a database transaction.
            </p>
          </div>
        )}

        {/* STEP 5: Completion Report */}
        {step === 5 && executionResult && (
          <div className="py-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Import Completed Successfully
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Processed {executionResult.total} {entityType} records into the
                workspace database.
              </p>
            </div>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
