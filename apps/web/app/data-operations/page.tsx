"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  importExportApi,
  ImportExportJobDto,
  getEntityLabel,
} from "@/lib/api/import-export-api";
import { ImportWizard } from "@/components/ui/import-wizard";
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  Download,
  Search,
  Filter,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  Layers,
  History,
  Loader2,
  Clock,
  Check,
} from "lucide-react";

export default function DataOperationsPage() {
  const [jobs, setJobs] = React.useState<ImportExportJobDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [entityFilter, setEntityFilter] = React.useState("ALL");
  const [typeFilter, setTypeFilter] = React.useState("ALL");

  // Reversal Dialog State
  const [revertingJob, setRevertingJob] = React.useState<ImportExportJobDto | null>(null);
  const [revertLoading, setRevertLoading] = React.useState(false);
  const [revertError, setRevertError] = React.useState<string | null>(null);

  // Inspection Modal State
  const [inspectingJob, setInspectingJob] = React.useState<ImportExportJobDto | null>(null);

  // Global Import Wizard Trigger
  const [isImportWizardOpen, setIsImportWizardOpen] = React.useState(false);
  const [importEntity] = React.useState("PurchaseOrder");

  // Toast Notification
  const [notice, setNotice] = React.useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const showNotice = (message: string, type: "success" | "error" | "info" = "success") => {
    setNotice({ message, type });
    setTimeout(() => {
      setNotice((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  };

  const loadJobs = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await importExportApi.getJobs();
      setJobs(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load data operations history.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleExecuteReverse = async () => {
    if (!revertingJob) return;
    setRevertLoading(true);
    setRevertError(null);
    try {
      const res = await importExportApi.reverseImport(revertingJob.id);
      showNotice(
        `Successfully reversed "${getEntityLabel(revertingJob.entityType)}" import. ${res.revertedCount} record(s) and side effects were undone.`,
        "success",
      );
      setRevertingJob(null);
      await loadJobs();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to reverse import operation";
      setRevertError(msg);
    } finally {
      setRevertLoading(false);
    }
  };

  // Filtered jobs
  const filteredJobs = React.useMemo(() => {
    return jobs.filter((job) => {
      if (typeFilter !== "ALL" && job.jobType !== typeFilter) {
        return false;
      }
      if (statusFilter !== "ALL" && job.status !== statusFilter) {
        return false;
      }
      if (entityFilter !== "ALL" && job.entityType !== entityFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesName = job.fileName?.toLowerCase().includes(q);
        const matchesEntity = job.entityType.toLowerCase().includes(q);
        const matchesLabel = getEntityLabel(job.entityType)
          .toLowerCase()
          .includes(q);
        const matchesId = job.id.toLowerCase().includes(q);
        if (!matchesName && !matchesEntity && !matchesLabel && !matchesId) {
          return false;
        }
      }
      return true;
    });
  }, [jobs, search, statusFilter, entityFilter, typeFilter]);

  // Aggregate metrics
  const totalOperations = jobs.length;
  const completedImports = jobs.filter(
    (j) => j.jobType === "IMPORT" && j.status === "COMPLETED",
  ).length;
  const reversedOperations = jobs.filter((j) => j.status === "REVERSED").length;
  const failedOperations = jobs.filter((j) => j.status === "FAILED").length;

  // Distinct entities in history for filtering
  const distinctEntities = React.useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      if (j.entityType) set.add(j.entityType);
    });
    return Array.from(set).sort();
  }, [jobs]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Operations & Import History"
        description="Comprehensive audit trail of batch data imports and exports across all modules with full rollback and undo capabilities."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadJobs}
              disabled={loading}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setIsImportWizardOpen(true)}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              New Import
            </Button>
          </div>
        }
      />

      {/* Toast Notice Banner */}
      {notice && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between transition-all duration-300 ${
            notice.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              : notice.type === "error"
                ? "bg-destructive/10 border-destructive/20 text-destructive"
                : "bg-primary/10 border-primary/20 text-primary"
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {notice.type === "success" ? (
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : notice.type === "error" ? (
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            ) : (
              <History className="w-4 h-4 text-primary shrink-0" />
            )}
            <span>{notice.message}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNotice(null)}
            className="h-6 w-6 text-muted-foreground hover:text-foreground -mr-1"
          >
            <span className="sr-only">Dismiss</span>
            &times;
          </Button>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Operations"
          value={totalOperations.toString()}
          subtitle="Recorded batch transactions"
          icon={History}
        />
        <StatCard
          title="Completed Imports"
          value={completedImports.toString()}
          subtitle="Active persisted datasets"
          icon={CheckCircle2}
        />
        <StatCard
          title="Reverted Operations"
          value={reversedOperations.toString()}
          subtitle="Safely rolled back & undone"
          icon={RotateCcw}
        />
        <StatCard
          title="Failed / With Errors"
          value={failedOperations.toString()}
          subtitle="Validation or write errors"
          icon={AlertTriangle}
        />
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 bg-card border border-border rounded-xl shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file name, entity, or job ID..."
            className="pl-9 h-8 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />

          {/* Operation Type Filter */}
          <Select
            value={typeFilter}
            onValueChange={(val) => setTypeFilter(val || "ALL")}
          >
            <SelectTrigger className="h-8 text-xs w-[120px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="IMPORT">Imports</SelectItem>
              <SelectItem value="EXPORT">Exports</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val || "ALL")}
          >
            <SelectTrigger className="h-8 text-xs w-[140px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="REVERSED">Reverted (Undone)</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="PROCESSING">Processing</SelectItem>
              <SelectItem value="QUEUED">Queued</SelectItem>
            </SelectContent>
          </Select>

          {/* Entity Filter */}
          <Select
            value={entityFilter}
            onValueChange={(val) => setEntityFilter(val || "ALL")}
          >
            <SelectTrigger className="h-8 text-xs w-[160px]">
              <SelectValue placeholder="All Entities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Entities</SelectItem>
              {distinctEntities.map((ent) => (
                <SelectItem key={ent} value={ent}>
                  {getEntityLabel(ent)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table Content */}
      {loading ? (
        <LoadingState message="Loading data operations history..." />
      ) : error ? (
        <ErrorState
          title="Error Loading Operations"
          message={error}
          onRetry={loadJobs}
        />
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-border rounded-xl bg-muted/10 space-y-3">
          <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto" />
          <h3 className="text-sm font-semibold text-foreground">
            No Data Operations Found
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {jobs.length === 0
              ? "No import or export jobs have been recorded yet. Perform an import to start tracking operations."
              : "No operations match the selected search or filter criteria."}
          </p>
          {jobs.length === 0 && (
            <Button
              size="sm"
              onClick={() => setIsImportWizardOpen(true)}
              className="mt-2"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Perform First Import
            </Button>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Target Entity</th>
                  <th className="py-3 px-4">File Source</th>
                  <th className="py-3 px-4">Records</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredJobs.map((job) => {
                  const isImport = job.jobType === "IMPORT";
                  const isReversible =
                    isImport &&
                    (job.status === "COMPLETED" ||
                      job.status === "PROCESSING" ||
                      job.processedRecords > 0) &&
                    job.status !== "REVERSED";
                  const isReversed = job.status === "REVERSED";

                  const createdCount = job.createdEntities?.length ?? 0;
                  const sideEffectCount =
                    job.createdEntities?.filter((e) => e.isSideEffect).length ??
                    0;

                  return (
                    <tr
                      key={job.id}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      {/* Date & Time */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>
                            {new Date(job.createdAt).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground pl-5 truncate max-w-[140px]">
                          {job.id}
                        </div>
                      </td>

                      {/* Operation Type */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                            isImport
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {isImport ? (
                            <Upload className="w-3 h-3" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          {job.jobType}
                        </span>
                      </td>

                      {/* Target Entity */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-foreground">
                          {getEntityLabel(job.entityType)}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {job.entityType}
                        </div>
                      </td>

                      {/* File Source */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-foreground truncate max-w-[180px]">
                          {job.fileName || "Direct Stream / API"}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase">
                          {job.format}
                        </div>
                      </td>

                      {/* Records Summary */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-foreground">
                          {job.processedRecords} / {job.totalRecords}
                        </div>
                        {createdCount > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            {createdCount} created
                            {sideEffectCount > 0 && ` (${sideEffectCount} side-effects)`}
                          </div>
                        )}
                        {job.failedRecords > 0 && (
                          <div className="text-[10px] text-destructive font-medium">
                            {job.failedRecords} error(s)
                          </div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isReversed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <RotateCcw className="w-3 h-3" />
                            REVERTED
                          </span>
                        ) : job.status === "COMPLETED" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            COMPLETED
                          </span>
                        ) : job.status === "FAILED" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-destructive/10 text-destructive border border-destructive/20">
                            <XCircle className="w-3 h-3" />
                            FAILED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {job.status}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 whitespace-nowrap text-right space-x-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspectingJob(job)}
                          className="h-7 px-2 text-xs"
                          title="Inspect details and logs"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Inspect
                        </Button>

                        {isReversible && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setRevertError(null);
                              setRevertingJob(job);
                            }}
                            className="h-7 px-2.5 text-xs shadow-none"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Undo / Revert
                          </Button>
                        )}
                        {isReversed && (
                          <span className="text-[11px] text-muted-foreground italic px-2">
                            Undone
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REVERT CONFIRMATION DIALOG */}
      {revertingJob && (
        <DialogShell
          open={Boolean(revertingJob)}
          onOpenChange={(open) => {
            if (!open) {
              setRevertingJob(null);
              setRevertError(null);
            }
          }}
          title={`Undo / Revert Import Operation`}
          description={`Safely roll back and delete all database entries and side effects created by this import.`}
          size="md"
          closeDisabled={revertLoading}
        >
          <DialogShellBody className="space-y-4">
            {revertError && (
              <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                {revertError}
              </div>
            )}

            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2 text-xs text-amber-700 dark:text-amber-300">
              <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Confirm Rollback Action</span>
              </div>
              <p>
                You are about to revert the import of{" "}
                <strong>{getEntityLabel(revertingJob.entityType)}</strong> (Job ID:{" "}
                <code className="font-mono text-[11px]">{revertingJob.id.slice(0, 8)}</code>)
                originating from file <strong>{revertingJob.fileName || "batch import"}</strong>.
              </p>
            </div>

            {/* Impact Summary */}
            <div className="bg-muted/30 border border-border rounded-xl p-3 space-y-2 text-xs">
              <p className="font-semibold text-foreground">Impacted Database Records:</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 bg-card rounded border border-border">
                  <span className="text-muted-foreground">Created Primary Records:</span>
                  <p className="font-bold text-foreground mt-0.5">
                    {revertingJob.createdEntities?.filter((e) => !e.isSideEffect).length ||
                      revertingJob.processedRecords}{" "}
                    records
                  </p>
                </div>
                <div className="p-2 bg-card rounded border border-border">
                  <span className="text-muted-foreground">Auto-Created Side Effects:</span>
                  <p className="font-bold text-foreground mt-0.5">
                    {revertingJob.createdEntities?.filter((e) => e.isSideEffect).length || 0}{" "}
                    records (e.g. SKUs)
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                All records will be deleted in reverse topological dependency order. The import job
                status will transition to <strong>REVERSED</strong>.
              </p>
            </div>
          </DialogShellBody>
          <DialogShellFooter>
            <DialogShellCancelButton disabled={revertLoading} />
            <Button
              variant="destructive"
              size="sm"
              onClick={handleExecuteReverse}
              disabled={revertLoading}
            >
              {revertLoading ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Confirm Revert & Delete
            </Button>
          </DialogShellFooter>
        </DialogShell>
      )}

      {/* INSPECTION / LOGS MODAL */}
      {inspectingJob && (
        <DialogShell
          open={Boolean(inspectingJob)}
          onOpenChange={(open) => {
            if (!open) setInspectingJob(null);
          }}
          title={`Operation Details: ${getEntityLabel(inspectingJob.entityType)}`}
          description={`Job ID: ${inspectingJob.id}`}
          size="lg"
        >
          <DialogShellBody className="space-y-4">
            {/* Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 bg-muted/20 border border-border rounded-lg">
                <span className="text-muted-foreground text-[10px] uppercase font-semibold">
                  Job Type
                </span>
                <p className="font-bold text-foreground mt-0.5">{inspectingJob.jobType}</p>
              </div>
              <div className="p-2.5 bg-muted/20 border border-border rounded-lg">
                <span className="text-muted-foreground text-[10px] uppercase font-semibold">
                  Status
                </span>
                <p className="font-bold text-foreground mt-0.5">{inspectingJob.status}</p>
              </div>
              <div className="p-2.5 bg-muted/20 border border-border rounded-lg">
                <span className="text-muted-foreground text-[10px] uppercase font-semibold">
                  Processed / Total
                </span>
                <p className="font-bold text-foreground mt-0.5">
                  {inspectingJob.processedRecords} / {inspectingJob.totalRecords}
                </p>
              </div>
              <div className="p-2.5 bg-muted/20 border border-border rounded-lg">
                <span className="text-muted-foreground text-[10px] uppercase font-semibold">
                  Created Tracked
                </span>
                <p className="font-bold text-foreground mt-0.5">
                  {inspectingJob.createdEntities?.length ?? 0}
                </p>
              </div>
            </div>

            {/* Created Entities List */}
            {inspectingJob.createdEntities && inspectingJob.createdEntities.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  Created Record IDs ({inspectingJob.createdEntities.length})
                </p>
                <div className="max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border bg-card text-xs">
                  {inspectingJob.createdEntities.map((ent, idx) => (
                    <div
                      key={idx}
                      className="p-2 flex items-center justify-between hover:bg-muted/10 font-mono text-[11px]"
                    >
                      <span className="font-semibold text-foreground">
                        {ent.entityType}
                        {ent.isSideEffect && (
                          <span className="ml-1.5 text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-sans">
                            Side Effect
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground">{ent.id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Logs Table */}
            {inspectingJob.errors && inspectingJob.errors.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Row-Level Error Details ({inspectingJob.errors.length})
                </p>
                <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border bg-card text-xs">
                  {inspectingJob.errors.map((err, idx) => (
                    <div key={idx} className="p-2.5 space-y-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-bold text-foreground">Row {err.row}</span>
                        {err.column && (
                          <span className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            Column: {err.column}
                          </span>
                        )}
                        {err.value !== undefined && err.value !== null && (
                          <span className="text-muted-foreground truncate max-w-[150px]">
                            &quot;{String(err.value)}&quot;
                          </span>
                        )}
                      </div>
                      <p className="text-destructive font-medium text-[11px]">{err.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 text-center bg-muted/10 rounded-lg border border-border text-xs text-muted-foreground">
                No error logs reported for this operation.
              </div>
            )}
          </DialogShellBody>
          <DialogShellFooter>
            {inspectingJob.jobType === "IMPORT" &&
              inspectingJob.status !== "REVERSED" &&
              (inspectingJob.status === "COMPLETED" || inspectingJob.processedRecords > 0) && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    const target = inspectingJob;
                    setInspectingJob(null);
                    setRevertingJob(target);
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Undo / Revert Import
                </Button>
              )}
            <Button size="sm" onClick={() => setInspectingJob(null)}>
              Close
            </Button>
          </DialogShellFooter>
        </DialogShell>
      )}

      {/* GLOBAL IMPORT WIZARD */}
      {isImportWizardOpen && (
        <ImportWizard
          isOpen={isImportWizardOpen}
          onClose={() => setIsImportWizardOpen(false)}
          entityType={importEntity}
          onImportComplete={() => {
            loadJobs();
          }}
        />
      )}
    </div>
  );
}
