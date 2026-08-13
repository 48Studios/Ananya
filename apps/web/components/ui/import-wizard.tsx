"use client";

import * as React from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Download,
  Loader2,
  FileCheck,
} from "lucide-react";
import {
  importExportApi,
  ImportPreviewResultDto,
  ImportExportJobDto,
  getEntityLabel,
} from "@/lib/api/import-export-api";
import { deriveImportJobState, isJobTerminal } from "@/lib/import-job-status";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { FileUploader, FileUploaderRef } from "@/components/ui/file-uploader";

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
  const [executionJob, setExecutionJob] =
    React.useState<ImportExportJobDto | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [importFile, setImportFile] = React.useState<File | null>(null);

  const fileUploaderRef = React.useRef<FileUploaderRef | null>(null);
  const pollingRef = React.useRef<NodeJS.Timeout | null>(null);
  const displayLabel = previewData?.label || getEntityLabel(entityType);

  const stopPolling = React.useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  React.useEffect(() => {
    if (isOpen) {
      setStep(1);
      setPreviewData(null);
      setColumnMapping({});
      setLoading(false);
      setExecutionJob(null);
      setErrorMsg(null);
      setImportFile(null);
      fileUploaderRef.current?.reset();
      stopPolling();
    }
  }, [isOpen, stopPolling]);

  const handleFileUpload = async (file: File) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const preview = await importExportApi.previewImport(entityType, file);
      setImportFile(file);
      setPreviewData(preview);
      setColumnMapping(preview.columnMapping);
      setStep(2);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to parse file");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      let csv = "";
      try {
        csv = await importExportApi.getTemplateCsv(entityType);
      } catch {
        const template = await importExportApi.getTemplate(entityType);
        csv = [
          template.headers.join(","),
          Object.values(template.sampleRow)
            .map((v) => `"${v}"`)
            .join(","),
        ].join("\n");
      }
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

  const startPollingJob = React.useCallback(
    (jobId: string) => {
      stopPolling();
      pollingRef.current = setInterval(async () => {
        try {
          const updatedJob = await importExportApi.getJob(jobId);
          setExecutionJob(updatedJob);

          if (isJobTerminal(updatedJob.status)) {
            stopPolling();
            setLoading(false);
            setStep(5);
            if (onImportComplete) onImportComplete();
          }
        } catch {
          // Continue polling on transient errors
        }
      }, 1000);
    },
    [stopPolling, onImportComplete],
  );

  const handleExecuteImport = async () => {
    if (!previewData || !importFile) return;
    setLoading(true);
    setErrorMsg(null);
    setStep(4);

    try {
      const job = await importExportApi.executeImport(
        entityType,
        columnMapping,
        importFile,
      );
      setExecutionJob(job);

      if (isJobTerminal(job.status)) {
        setLoading(false);
        setStep(5);
        if (onImportComplete) onImportComplete();
      } else {
        startPollingJob(job.id);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Import execution failed",
      );
      setStep(3);
      setLoading(false);
    }
  };

  const derivedState = executionJob ? deriveImportJobState(executionJob) : null;
  const progressPercent = executionJob?.progressPercent ?? 50;

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={`Import ${displayLabel} Wizard`}
      description={`Upload a spreadsheet, map columns, validate rows, and import ${displayLabel.toLowerCase()} records through the production import framework.`}
      size="lg"
      closeDisabled={loading && step === 4}
    >
      <DialogShellBody className="space-y-5">
        <div className="flex items-center gap-2 text-primary">
          <FileSpreadsheet className="size-5" />
          <span className="text-sm font-medium text-foreground">
            Import workflow
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-border pb-3 text-xs font-mono text-muted-foreground">
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
            4. Report
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
            <FileUploader
              ref={fileUploaderRef}
              accept=".csv,.xlsx,.json"
              title={`Upload ${displayLabel} CSV, XLSX, or JSON file`}
              description="Drag and drop your spreadsheet or click to browse (up to 50MB)"
              loading={loading}
              disabled={loading}
              onFileSelected={handleFileUpload}
            />

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
                <Download className="mr-1 size-3.5" />
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
                {displayLabel} database repository.
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
          </div>
        )}

        {/* STEP 4: Execution Progress */}
        {step === 4 && (
          <div className="py-10 text-center space-y-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Executing Batch Import ({progressPercent}%)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Persisting records inside a database transaction.
              </p>
            </div>

            <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border">
              <div
                className="bg-primary h-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* STEP 5: Completion & Error Report */}
        {step === 5 && executionJob && (
          <div className="py-4 space-y-5">
            {/* 1. SUCCESS STATE */}
            {derivedState === "COMPLETED_SUCCESS" && (
              <div className="text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Import Completed Successfully
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Processed all {executionJob.totalRecords} {displayLabel}{" "}
                    records into the workspace database.
                  </p>
                </div>
              </div>
            )}

            {/* 2. PARTIAL SUCCESS STATE */}
            {derivedState === "COMPLETED_PARTIAL" && (
              <div className="text-center space-y-3">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Import Completed with Partial Success
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Imported {executionJob.processedRecords} of{" "}
                    {executionJob.totalRecords} {displayLabel} records.{" "}
                    {executionJob.failedRecords} records failed.
                  </p>
                </div>
              </div>
            )}

            {/* 3. FAILED STATE */}
            {derivedState === "FAILED" && (
              <div className="text-center space-y-3">
                <XCircle className="w-12 h-12 text-destructive mx-auto" />
                <div>
                  <h3 className="text-base font-bold text-destructive">
                    Import Failed
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    0 records imported successfully. All{" "}
                    {executionJob.failedRecords || executionJob.totalRecords}{" "}
                    {displayLabel} records failed validation or database
                    execution.
                  </p>
                </div>
              </div>
            )}

            {/* METRICS SUMMARY GRID */}
            <div className="grid grid-cols-3 gap-3 text-center bg-muted/20 p-3 rounded-lg border border-border text-xs">
              <div className="space-y-0.5">
                <span className="text-muted-foreground">Total Records</span>
                <p className="text-sm font-bold text-foreground">
                  {executionJob.totalRecords}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-muted-foreground">Imported</span>
                <p
                  className={`text-sm font-bold ${
                    executionJob.processedRecords > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {executionJob.processedRecords}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-muted-foreground">Failed</span>
                <p
                  className={`text-sm font-bold ${
                    executionJob.failedRecords > 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {executionJob.failedRecords}
                </p>
              </div>
            </div>

            {/* ROW ERROR REPORT DETAILS TABLE */}
            {executionJob.errors && executionJob.errors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Row-Level Errors ({executionJob.errors.length})
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Status: {executionJob.status}
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border bg-muted/10 text-xs">
                  {executionJob.errors.map((err, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 space-y-1 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-bold text-foreground">
                          Row {err.row}
                        </span>
                        {err.column && (
                          <span className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            Column: {err.column}
                          </span>
                        )}
                        {err.value !== undefined && err.value !== null && (
                          <span className="truncate max-w-[150px] text-muted-foreground">
                            Value: &quot;{String(err.value)}&quot;
                          </span>
                        )}
                      </div>
                      <p className="text-destructive font-medium text-[11px]">
                        {err.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogShellBody>
      <DialogShellFooter>
        {step === 1 && (
          <>
            <DialogShellCancelButton disabled={loading} />
            <Button
              size="sm"
              onClick={() => fileUploaderRef.current?.openFilePicker()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 size-3.5" />
              )}
              Upload File
            </Button>
          </>
        )}
        {step === 2 && (
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
              {loading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              Validate & Next
            </Button>
          </>
        )}
        {step === 3 && (
          <>
            <Button variant="outline" size="sm" onClick={() => setStep(2)}>
              Back to Mapping
            </Button>
            <Button size="sm" onClick={handleExecuteImport}>
              Confirm & Import
            </Button>
          </>
        )}
        {step === 4 && (
          <>
            <DialogShellCancelButton disabled>Cancel</DialogShellCancelButton>
            <Button variant="outline" size="sm" disabled>
              Import Running...
            </Button>
          </>
        )}
        {step === 5 && (
          <>
            <DialogShellCancelButton>Cancel</DialogShellCancelButton>
            <Button
              size="sm"
              variant={derivedState === "FAILED" ? "destructive" : "default"}
              onClick={onClose}
            >
              Done
            </Button>
          </>
        )}
      </DialogShellFooter>
    </DialogShell>
  );
}
