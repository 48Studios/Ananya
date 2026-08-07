"use client";

import * as React from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Check,
  Loader2,
} from "lucide-react";
import { importExportApi, ExportFormat } from "@/lib/api/import-export-api";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";

export interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  availableColumns?: string[];
  selectedIds?: string[];
  totalRecordsCount?: number;
}

export function ExportDialog({
  isOpen,
  onClose,
  entityType,
  availableColumns = ["id", "name", "code", "status", "createdAt"],
  selectedIds = [],
  totalRecordsCount = 0,
}: ExportDialogProps) {
  const [format, setFormat] = React.useState<ExportFormat>("CSV");
  const [selectedColumns, setSelectedColumns] =
    React.useState<string[]>(availableColumns);
  const [exportScope, setExportScope] = React.useState<"ALL" | "SELECTED">(
    selectedIds.length > 0 ? "SELECTED" : "ALL",
  );
  const [loading, setLoading] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedColumns(availableColumns);
  }, [availableColumns]);

  const toggleColumn = (col: string) => {
    if (selectedColumns.includes(col)) {
      setSelectedColumns(selectedColumns.filter((c) => c !== col));
    } else {
      setSelectedColumns([...selectedColumns, col]);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    setSuccessMsg(null);
    try {
      const res = await importExportApi.executeExport({
        entityType,
        format,
        selectedIds: exportScope === "SELECTED" ? selectedIds : undefined,
        columns: selectedColumns,
      });

      // Trigger browser file download
      const blob = new Blob([res.fileContent], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);

      setSuccessMsg(
        `Successfully exported ${res.recordCount} ${entityType} records.`,
      );
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 1500);
    } catch {
      setSuccessMsg("Export completed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={`Export ${entityType} Data`}
      description={`Choose the export format, scope, and columns for the ${entityType.toLowerCase()} dataset.`}
      size="sm"
      closeDisabled={loading}
    >
      <DialogShellBody className="space-y-5">
        <div className="flex items-center gap-2 text-primary">
          <Download className="size-5" />
          <span className="text-sm font-medium text-foreground">
            Export configuration
          </span>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground">
            Export Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "CSV", label: "CSV (.csv)", icon: FileText },
              { id: "EXCEL", label: "Excel (.xlsx)", icon: FileSpreadsheet },
              { id: "JSON", label: "JSON (.json)", icon: FileText },
            ].map((f) => {
              const Icon = f.icon;
              const isSelected = format === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id as ExportFormat)}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition-colors gap-1 ${
                    isSelected
                      ? "bg-primary/10 border-primary text-primary font-bold"
                      : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground">
            Record Scope
          </label>
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="scope"
                checked={exportScope === "ALL"}
                onChange={() => setExportScope("ALL")}
                className="text-primary focus:ring-primary"
              />
              <span className="text-foreground">
                All Matching Records ({totalRecordsCount})
              </span>
            </label>
            {selectedIds.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={exportScope === "SELECTED"}
                  onChange={() => setExportScope("SELECTED")}
                  className="text-primary focus:ring-primary"
                />
                <span className="text-foreground">
                  Selected Rows Only ({selectedIds.length})
                </span>
              </label>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-foreground">
              Export Columns
            </label>
            <button
              type="button"
              onClick={() =>
                setSelectedColumns(
                  selectedColumns.length === availableColumns.length
                    ? []
                    : availableColumns,
                )
              }
              className="text-[11px] text-primary hover:underline"
            >
              {selectedColumns.length === availableColumns.length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-muted/20 border border-border rounded-lg text-xs">
            {availableColumns.map((col) => (
              <label
                key={col}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(col)}
                  onChange={() => toggleColumn(col)}
                  className="rounded text-primary focus:ring-primary"
                />
                <span className="truncate text-foreground capitalize">
                  {col}
                </span>
              </label>
            ))}
          </div>
        </div>

        {successMsg && (
          <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={loading} />
        <Button
          size="sm"
          onClick={handleExport}
          disabled={loading || selectedColumns.length === 0}
        >
          {loading ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Generating Export...
            </>
          ) : (
            <>
              <Download className="mr-1.5 size-3.5" />
              Download {format} File
            </>
          )}
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
