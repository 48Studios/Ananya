"use client";

import * as React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Download,
  Loader2,
  FileCheck,
} from "lucide-react";
import {
  importExportApi,
  ImportPreviewResultDto,
} from "@/lib/api/import-export-api";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/ui/file-uploader";
import { DialogShell } from "@/components/ui/dialog-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useAuth } from "@/lib/auth/auth-context";

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
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
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

  const handleFileSelected = async (file: File) => {
    setLoading(true);
    setErrorMsg(null);
    setSelectedFile(file);

    try {
      const preview = await importExportApi.previewImport(entityType, file);
      setPreviewData(preview);
      setColumnMapping(preview.columnMapping);
      setStep(2);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to parse import file",
      );
    } finally {
      setLoading(false);
    }
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
      // ignore template download failure
    }
  };

  const handleExecuteImport = async () => {
    if (!selectedFile) {
      setErrorMsg("No file selected for import execution");
      return;
    }
    setLoading(true);
    setStep(4);
    try {
      const job = await importExportApi.executeImport(
        entityType,
        columnMapping,
        selectedFile,
        user?.id,
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

  const renderFooter = () => {
    if (step === 1) {
      return (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="text-xs text-primary mr-auto"
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            Download Sample Template
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </>
      );
    }
    if (step === 2) {
      return (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep(1)}
            disabled={loading}
          >
            Back
          </Button>
          <Button size="sm" onClick={() => setStep(3)} disabled={loading}>
            {loading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Validate & Next
          </Button>
        </>
      );
    }
    if (step === 3) {
      return (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep(2)}
            disabled={loading}
          >
            Back to Mapping
          </Button>
          <Button size="sm" onClick={handleExecuteImport} disabled={loading}>
            Confirm & Import
          </Button>
        </>
      );
    }
    if (step === 5) {
      return (
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      );
    }
    return null;
  };

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading) {
          onClose();
        }
      }}
      title={`Import ${entityType} Wizard`}
      description={`Multi-step batch import framework for ${entityType} records.`}
      size="xl"
      footer={renderFooter()}
    >
      <div className="space-y-4">
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

        {/* STEP 1: Upload File using Shared FileUploader */}
        {step === 1 && (
          <FileUploader
            accept=".csv,.xlsx,.json"
            maxSizeBytes={50 * 1024 * 1024}
            loading={loading}
            onFileSelected={handleFileSelected}
            title={`Upload ${entityType} CSV, XLSX, or JSON file`}
            description="Drag and drop your spreadsheet or click to browse"
          />
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
          </div>
        )}

        {/* STEP 3: Validation Summary */}
        {step === 3 && previewData && (
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
          </div>
        )}
      </div>
    </DialogShell>
  );
}

