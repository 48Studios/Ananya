"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  CheckCircle2,
  Download,
  Edit2,
  FileCheck,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionGuard, useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  backupsApi,
  type BackupArtifact,
  type BackupJob,
  type BackupsMetricsSnapshot,
  type RestoreOperation,
  type RestorePreviewResult,
} from "@/lib/api/backups-api";

function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function BackupRestorePage() {
  const { hasPermission } = useAuth();
  const [artifacts, setArtifacts] = React.useState<BackupArtifact[]>([]);
  const [jobs, setJobs] = React.useState<BackupJob[]>([]);
  const [restores, setRestores] = React.useState<RestoreOperation[]>([]);
  const [metrics, setMetrics] = React.useState<BackupsMetricsSnapshot | null>(null);
  const [restoreSearch, setRestoreSearch] = React.useState("");
  const [restorePage, setRestorePage] = React.useState(1);
  const [tab, setTab] = React.useState<
    "overview" | "backups" | "jobs" | "restores"
  >("overview");

  // Create manual backup state
  const [name, setName] = React.useState("Manual backup");
  const [encrypted, setEncrypted] = React.useState(false);
  const [passphrase, setPassphrase] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Restore workflow state
  const [restoreSourceType, setRestoreSourceType] = React.useState<"upload" | "artifact">("upload");
  const [selectedArtifactId, setSelectedArtifactId] = React.useState<string>("");
  const [restoreFile, setRestoreFile] = React.useState<File | null>(null);
  const [restorePassphrase, setRestorePassphrase] = React.useState("");
  const [conflictPolicy, setConflictPolicy] = React.useState<"SKIP" | "UPDATE" | "ABORT">("ABORT");
  const [restorePreview, setRestorePreview] = React.useState<RestorePreviewResult | null>(null);
  const [confirmDestructive, setConfirmDestructive] = React.useState(false);
  const [restoreExecuting, setRestoreExecuting] = React.useState(false);
  const [restoreResult, setRestoreResult] = React.useState<Record<string, unknown> | null>(null);

  // Job create / edit modal state
  const [editingJob, setEditingJob] = React.useState<BackupJob | null>(null);
  const [showJobModal, setShowJobModal] = React.useState(false);
  const [jobFormName, setJobFormName] = React.useState("");
  const [jobFormFrequency, setJobFormFrequency] = React.useState("DAILY");
  const [jobFormTime, setJobFormTime] = React.useState("02:00");
  const [jobFormTimezone, setJobFormTimezone] = React.useState("UTC");
  const [jobFormRetentionCount, setJobFormRetentionCount] = React.useState<number | "">(30);
  const [jobFormRetentionDays, setJobFormRetentionDays] = React.useState<number | "">(90);
  const [jobFormRetryLimit, setJobFormRetryLimit] = React.useState<number>(2);
  const [jobFormNotifySuccess, setJobFormNotifySuccess] = React.useState(true);
  const [jobFormNotifyFailure, setJobFormNotifyFailure] = React.useState(true);

  const canCreate = hasPermission("Administration.Backups.Create") || hasPermission("Administration.Settings");
  const canRun = hasPermission("Administration.Backups.Run") || hasPermission("Administration.Settings");
  const canDelete = hasPermission("Administration.Backups.Delete") || hasPermission("Administration.Settings");
  const canPreview = hasPermission("Administration.Backups.Restore.Preview") || hasPermission("Administration.Settings");
  const canExecuteRestore = hasPermission("Administration.Backups.Restore.Execute") || hasPermission("Administration.Settings");

  const load = React.useCallback(async () => {
    try {
      const [nextArtifacts, nextJobs, nextRestores, nextMetrics] = await Promise.all([
        backupsApi.artifacts().catch(() => []),
        backupsApi.jobs().catch(() => []),
        backupsApi.restores().catch(() => []),
        backupsApi.metrics().catch(() => null),
      ]);
      setArtifacts(nextArtifacts);
      setJobs(nextJobs);
      setRestores(nextRestores);
      setMetrics(nextMetrics);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load backup data.");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleCreateBackup() {
    if (encrypted && passphrase.length < 8) {
      setErrorMessage("Passphrase must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await backupsApi.create({
        name,
        type: "FULL",
        encrypted,
        ...(encrypted ? { passphrase } : {}),
      });
      setPassphrase(""); // clear secret immediately
      setStatusMessage("Backup archive successfully created and checksum verified.");
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Backup creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(id: string, fileName: string) {
    try {
      const blob = await backupsApi.download(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${fileName}.archive`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Download failed.");
    }
  }

  async function handlePreviewRestore() {
    setBusy(true);
    setErrorMessage(null);
    setRestorePreview(null);
    setConfirmDestructive(false);
    setRestoreResult(null);

    try {
      if (restoreSourceType === "upload") {
        if (!restoreFile) {
          setErrorMessage("Please select a backup archive file to preview.");
          return;
        }
        const form = new FormData();
        form.append("file", restoreFile);
        if (restorePassphrase) form.append("passphrase", restorePassphrase);
        form.append("conflictPolicy", conflictPolicy);
        const preview = await backupsApi.previewRestore(form);
        setRestorePreview(preview);
      } else {
        if (!selectedArtifactId) {
          setErrorMessage("Please select an existing backup artifact to preview.");
          return;
        }
        const preview = await backupsApi.previewArtifact(selectedArtifactId, {
          passphrase: restorePassphrase || undefined,
          conflictPolicy,
        });
        setRestorePreview(preview);
      }
      setStatusMessage("Archive validated successfully. Review the canonical restore plan below before proceeding.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Restore preview validation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExecuteRestore() {
    if (!restorePreview) {
      setErrorMessage("You must preview and validate the archive before executing restore.");
      return;
    }
    if (!confirmDestructive) {
      setErrorMessage("Explicit confirmation of destructive operation is required.");
      return;
    }

    setRestoreExecuting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      let result: Record<string, unknown>;
      if (restoreSourceType === "upload" && restoreFile) {
        const form = new FormData();
        form.append("file", restoreFile);
        if (restorePassphrase) form.append("passphrase", restorePassphrase);
        form.append("operationId", restorePreview.operationId);
        form.append("planHash", restorePreview.planHash);
        form.append("confirmDestructive", "true");
        form.append("conflictPolicy", conflictPolicy);
        result = await backupsApi.restore(form);
      } else if (selectedArtifactId) {
        result = await backupsApi.restoreArtifact(selectedArtifactId, {
          operationId: restorePreview.operationId,
          planHash: restorePreview.planHash,
          confirmDestructive: true,
          passphrase: restorePassphrase || undefined,
        });
      } else {
        throw new Error("No restore source selected.");
      }

      setRestorePassphrase(""); // Scrub passphrase from memory
      setRestoreResult(result);
      setStatusMessage("Restore completed successfully! Pre-restore safety backup retained.");
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Restore execution failed.");
    } finally {
      setRestoreExecuting(false);
    }
  }

  function openCreateJobModal() {
    setEditingJob(null);
    setJobFormName("");
    setJobFormFrequency("DAILY");
    setJobFormTime("02:00");
    setJobFormTimezone("UTC");
    setJobFormRetentionCount(30);
    setJobFormRetentionDays(90);
    setJobFormRetryLimit(2);
    setJobFormNotifySuccess(true);
    setJobFormNotifyFailure(true);
    setShowJobModal(true);
  }

  function openEditJobModal(job: BackupJob) {
    setEditingJob(job);
    setJobFormName(job.name);
    setJobFormFrequency(job.frequency);
    setJobFormTime(job.timeOfDay);
    setJobFormTimezone(job.timezone);
    setJobFormRetentionCount(job.retentionMaxCount ?? 30);
    setJobFormRetentionDays(job.retentionMaxAgeDays ?? 90);
    setJobFormRetryLimit(job.retryLimit ?? 2);
    setJobFormNotifySuccess(job.notifyOnSuccess ?? true);
    setJobFormNotifyFailure(job.notifyOnFailure ?? true);
    setShowJobModal(true);
  }

  async function handleSaveJob() {
    if (!jobFormName.trim()) {
      setErrorMessage("Job name is required.");
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const payload = {
        name: jobFormName.trim(),
        frequency: jobFormFrequency,
        timeOfDay: jobFormTime,
        timezone: jobFormTimezone.trim() || "UTC",
        retentionMaxCount: jobFormRetentionCount === "" ? null : Number(jobFormRetentionCount),
        retentionMaxAgeDays: jobFormRetentionDays === "" ? null : Number(jobFormRetentionDays),
        retryLimit: Number(jobFormRetryLimit),
        notifyOnSuccess: jobFormNotifySuccess,
        notifyOnFailure: jobFormNotifyFailure,
        scope: { includeDatabase: true, includeFiles: true },
        encrypted: false,
      };

      if (editingJob) {
        await backupsApi.updateJob(editingJob.id, payload);
        setStatusMessage(`Scheduled job "${jobFormName}" updated.`);
      } else {
        await backupsApi.createJob(payload);
        setStatusMessage(`Scheduled job "${jobFormName}" created.`);
      }
      setShowJobModal(false);
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save scheduled job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PermissionGuard permission="Administration.Backups.Read">
      <div className="space-y-6">
        <PageHeader
          title="Backup & Restore"
          description="Enterprise system backup, automated scheduling, tamper-proof verification, and safe staged restores."
        />

        {statusMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto border-b border-border pb-2">
          {(["overview", "backups", "jobs", "restores"] as const).map(
            (item) => (
              <Button
                key={item}
                variant={tab === item ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  setTab(item);
                  setStatusMessage(null);
                  setErrorMessage(null);
                }}
              >
                {item === "overview"
                  ? "Overview & Metrics"
                  : item === "backups"
                    ? `Backups (${artifacts.length})`
                    : item === "jobs"
                      ? `Scheduled Jobs (${jobs.length})`
                      : `Restore Operations (${restores.length})`}
              </Button>
            ),
          )}
        </div>

        {/* ─── TAB 1: OVERVIEW & METRICS ───────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard
                title="Total Stored Backups"
                value={String(artifacts.length)}
                subtitle={formatBytes(
                  artifacts.reduce((total, item) => total + item.sizeBytes, 0),
                )}
                icon={<Archive className="h-5 w-5 text-primary" />}
              />
              <MetricCard
                title="Active Backup Jobs"
                value={String(jobs.filter((j) => j.enabled).length)}
                subtitle={`${jobs.length} total scheduled`}
                icon={<CalendarClock className="h-5 w-5 text-blue-500" />}
              />
              <MetricCard
                title="Backup Runs Started"
                value={String(metrics?.backupRunsStarted ?? 0)}
                subtitle={`${metrics?.backupRunsSucceeded ?? 0} succeeded · ${metrics?.backupRunsFailed ?? 0} failed`}
                icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
              />
              <MetricCard
                title="Restores Executed"
                value={String(metrics?.restoreOperationsStarted ?? 0)}
                subtitle={`${metrics?.restoreOperationsSucceeded ?? 0} succeeded · ${metrics?.restoreOperationsFailed ?? 0} failed`}
                icon={<RotateCcw className="h-5 w-5 text-amber-500" />}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                  Health & Performance
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Average Backup Duration:</dt>
                    <dd className="font-medium">
                      {metrics?.averageBackupDurationMs
                        ? `${(metrics.averageBackupDurationMs / 1000).toFixed(1)}s`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Last Backup Duration:</dt>
                    <dd className="font-medium">
                      {metrics?.lastBackupDurationMs
                        ? `${(metrics.lastBackupDurationMs / 1000).toFixed(1)}s`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total Data Backed Up:</dt>
                    <dd className="font-medium font-mono">
                      {formatBytes(metrics?.backupBytesProduced ?? 0)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                  Reliability & Recovery
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Backup Retries Triggered:</dt>
                    <dd className="font-medium">{metrics?.backupRetries ?? 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Abandoned Worker Recoveries:</dt>
                    <dd className="font-medium">{metrics?.abandonedRunRecoveries ?? 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Retention Deletions:</dt>
                    <dd className="font-medium">{metrics?.retentionDeletions ?? 0}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                  Notification Health
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Notification Failures:</dt>
                    <dd className="font-medium">
                      <span className={metrics?.notificationFailures ? "text-amber-600 font-semibold" : ""}>
                        {metrics?.notificationFailures ?? 0}
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Storage Backend:</dt>
                    <dd className="font-medium">Local Disk (Encrypted & Isolated)</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 2: BACKUPS LIST & MANUAL RUN ───────────────────────── */}
        {tab === "backups" && (
          <section className="space-y-4">
            {canCreate && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Create on-demand backup</h2>
                    <p className="text-sm text-muted-foreground">
                      Full database tables and document storage archive with optional AES-256-GCM encryption.
                    </p>
                  </div>
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Backup name"
                  />
                  <Input
                    type="password"
                    value={passphrase}
                    onChange={(event) => setPassphrase(event.target.value)}
                    placeholder={
                      encrypted ? "Passphrase (min 8 chars)" : "Unencrypted (toggle below to encrypt)"
                    }
                    disabled={!encrypted}
                  />
                  <Button
                    onClick={() => setEncrypted((value) => !value)}
                    variant={encrypted ? "default" : "outline"}
                  >
                    {encrypted ? "Encrypted (AES-256-GCM)" : "Unencrypted"}
                  </Button>
                </div>
                <Button
                  onClick={() => void handleCreateBackup()}
                  disabled={busy || (encrypted && passphrase.length < 8)}
                >
                  {busy ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="mr-2 h-4 w-4" />
                  )}
                  Create backup now
                </Button>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3">Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">Checksum</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {artifacts.map((artifact) => (
                    <tr
                      key={artifact.id}
                      className="border-b border-border last:border-0 hover:bg-muted/10"
                    >
                      <td className="p-3 font-medium">{artifact.name}</td>
                      <td className="p-3">
                        {artifact.type}
                        {artifact.encrypted ? " · encrypted" : ""}
                      </td>
                      <td className="p-3">{formatDate(artifact.createdAt)}</td>
                      <td className="p-3 font-mono">{formatBytes(artifact.sizeBytes)}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">
                        {artifact.checksum ? `${artifact.checksum.slice(0, 12)}…` : "—"}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={artifact.status} />
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {artifact.status === "COMPLETED" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Download Archive"
                                onClick={() => void handleDownload(artifact.id, artifact.name)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              {canPreview && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Prepare Restore with this Artifact"
                                  onClick={() => {
                                    setRestoreSourceType("artifact");
                                    setSelectedArtifactId(artifact.id);
                                    setTab("restores");
                                  }}
                                >
                                  <RotateCcw className="h-4 w-4 text-amber-600" />
                                </Button>
                              )}
                            </>
                          )}
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Delete Artifact"
                              onClick={() => {
                                if (window.confirm(`Delete backup "${artifact.name}" permanently?`)) {
                                  void backupsApi.remove(artifact.id).then(load);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!artifacts.length && (
                <div className="p-8 text-center text-muted-foreground">
                  No backup archives have been recorded yet.
                </div>
              )}
            </div>
          </section>
        )}

        {/* ─── TAB 3: SCHEDULED JOBS ──────────────────────────────────── */}
        {tab === "jobs" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-base">Configured Backup Schedules</h2>
                <p className="text-sm text-muted-foreground">
                  Automated recurrent jobs executed by the background scheduler with durable retries.
                </p>
              </div>
              {canCreate && (
                <Button onClick={openCreateJobModal} size="sm">
                  <Plus className="mr-2 h-4 w-4" /> New Scheduled Job
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 hover:border-muted-foreground/30 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/settings/backups/jobs/${job.id}`}
                        className="font-medium hover:underline text-base"
                      >
                        {job.name}
                      </Link>
                      <StatusBadge status={job.enabled ? "ACTIVE" : "PAUSED"} />
                      {job.consecutiveFailures > 0 && (
                        <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                          {job.consecutiveFailures} failures
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4">
                      <span>
                        Schedule: <strong>{job.frequency}</strong> at {job.timeOfDay} ({job.timezone})
                      </span>
                      <span>Next: {formatDate(job.nextRunAt)}</span>
                      <span>Last: {formatDate(job.lastRunAt)} ({job.lastResult ?? "No runs"})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canRun && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setStatusMessage(`Triggered run for job "${job.name}".`);
                          void backupsApi.runJob(job.id).then(load);
                        }}
                      >
                        <Play className="mr-1 h-4 w-4" /> Run now
                      </Button>
                    )}
                    {canCreate && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditJobModal(job)}
                          title="Edit Configuration"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title={job.enabled ? "Pause Job" : "Resume Job"}
                          onClick={() =>
                            void backupsApi.setJobEnabled(job.id, !job.enabled).then(load)
                          }
                        >
                          {job.enabled ? (
                            <XCircle className="h-4 w-4 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Delete Scheduled Job"
                        onClick={() => {
                          if (window.confirm(`Delete scheduled job "${job.name}"?`)) {
                            void backupsApi.deleteJob(job.id).then(load);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {!jobs.length && (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  No scheduled backup jobs configured. Click &ldquo;New Scheduled Job&rdquo; to create one.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 4: RESTORE OPERATIONS & 2-STEP WORKFLOW ───────────────── */}
        {tab === "restores" && (
          <div className="space-y-8">
            {/* Step 1 & 2: Restore Workflow */}
            <div className="space-y-4 rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-amber-600" />
                <h2 className="font-semibold text-lg">Safe 2-Step Restore Workflow</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                All restores require server-side archive inspection, canonical restore plan generation, and explicit confirmation of destructive operations. An automatic pre-restore safety snapshot will be created before any changes are committed.
              </p>

              {/* Source selection */}
              <div className="space-y-3 pt-2">
                <label className="text-sm font-medium">1. Select Archive Source</label>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant={restoreSourceType === "upload" ? "default" : "outline"}
                    onClick={() => {
                      setRestoreSourceType("upload");
                      setRestorePreview(null);
                    }}
                  >
                    Upload Archive File
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={restoreSourceType === "artifact" ? "default" : "outline"}
                    onClick={() => {
                      setRestoreSourceType("artifact");
                      setRestorePreview(null);
                    }}
                  >
                    Use Existing Backup Artifact
                  </Button>
                </div>

                {restoreSourceType === "upload" ? (
                  <Input
                    type="file"
                    onChange={(event) => {
                      setRestoreFile(event.target.files?.[0] ?? null);
                      setRestorePreview(null);
                    }}
                  />
                ) : (
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedArtifactId}
                    onChange={(e) => {
                      setSelectedArtifactId(e.target.value);
                      setRestorePreview(null);
                    }}
                  >
                    <option value="">-- Choose a completed backup artifact --</option>
                    {artifacts
                      .filter((a) => a.status === "COMPLETED")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({formatBytes(a.sizeBytes)}) — {formatDate(a.createdAt)}
                        </option>
                      ))}
                  </select>
                )}
              </div>

              {/* Passphrase & conflict policy */}
              <div className="grid gap-4 md:grid-cols-2 pt-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Decryption Passphrase (if encrypted)</label>
                  <Input
                    type="password"
                    placeholder="Enter archive passphrase"
                    value={restorePassphrase}
                    onChange={(e) => setRestorePassphrase(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Conflict Resolution Policy</label>
                  <div className="flex gap-2">
                    {(["ABORT", "SKIP", "UPDATE"] as const).map((policy) => (
                      <Button
                        key={policy}
                        type="button"
                        size="sm"
                        variant={conflictPolicy === policy ? "default" : "outline"}
                        onClick={() => setConflictPolicy(policy)}
                      >
                        {policy}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 1 Action: Preview */}
              <div className="pt-2">
                <Button
                  onClick={() => void handlePreviewRestore()}
                  disabled={
                    busy ||
                    (restoreSourceType === "upload" && !restoreFile) ||
                    (restoreSourceType === "artifact" && !selectedArtifactId)
                  }
                >
                  {busy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck className="mr-2 h-4 w-4" />}
                  Validate & Preview Archive
                </Button>
              </div>

              {/* Step 2: Canonical Plan Display & Destructive Confirmation */}
              {restorePreview && (
                <div className="mt-6 space-y-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <ShieldAlert className="h-5 w-5" />
                    <h3 className="font-semibold text-base">Canonical Restore Plan Generated</h3>
                  </div>

                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    <div>
                      <span className="text-muted-foreground">Operation ID:</span>
                      <p className="font-mono text-xs">{restorePreview.operationId}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Plan Integrity Hash:</span>
                      <p className="font-mono text-xs">{restorePreview.planHash}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Records to Process:</span>
                      <p className="font-semibold">{restorePreview.plan.recordsToProcess}</p>
                    </div>
                  </div>

                  <div className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Tables affected ({restorePreview.plan.tables.length}):</span>
                    <p className="font-mono text-xs bg-background/50 p-2 rounded border border-border">
                      {restorePreview.plan.tables.join(", ") || "None"}
                    </p>
                  </div>

                  <div className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Files affected ({restorePreview.plan.files.length}):</span>
                    <p className="font-mono text-xs bg-background/50 p-2 rounded border border-border">
                      {restorePreview.plan.files.length > 0
                        ? `${restorePreview.plan.files.length} document storage files`
                        : "None"}
                    </p>
                  </div>

                  {/* Explicit Confirmation Checkbox */}
                  <div className="pt-2 border-t border-amber-500/20">
                    <label className="flex items-start gap-3 cursor-pointer text-sm font-medium text-destructive">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-border"
                        checked={confirmDestructive}
                        onChange={(e) => setConfirmDestructive(e.target.checked)}
                      />
                      <span>
                        I understand this is a DESTRUCTIVE operation that will overwrite production data. I authorize Ananya to create a safety backup and proceed with restoring this archive.
                      </span>
                    </label>
                  </div>

                  {canExecuteRestore && (
                    <Button
                      variant="destructive"
                      disabled={!confirmDestructive || restoreExecuting}
                      onClick={() => void handleExecuteRestore()}
                    >
                      {restoreExecuting ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Executing Destructive Restore…
                        </>
                      ) : (
                        "Execute Destructive Restore"
                      )}
                    </Button>
                  )}
                </div>
              )}

              {/* Restore Execution Result */}
              {restoreResult && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm space-y-2">
                  <h4 className="font-semibold text-green-700 dark:text-green-300">Restore Operation Result</h4>
                  <pre className="overflow-x-auto text-xs font-mono bg-background/80 p-3 rounded">
                    {JSON.stringify(restoreResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Historical Restore Operations Table */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-base">Historical Restore Operations</h3>
                <Input
                  className="max-w-xs"
                  value={restoreSearch}
                  onChange={(event) => {
                    setRestoreSearch(event.target.value);
                    setRestorePage(1);
                  }}
                  placeholder="Filter by ID or status…"
                />
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-3">Restore ID</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Conflict Policy</th>
                      <th className="p-3">Started</th>
                      <th className="p-3">Completed</th>
                      <th className="p-3">Plan Hash</th>
                      <th className="p-3">Safety Backup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restores
                      .filter((r) =>
                        `${r.id} ${r.status}`.toLowerCase().includes(restoreSearch.toLowerCase()),
                      )
                      .slice((restorePage - 1) * 10, restorePage * 10)
                      .map((r) => (
                        <tr key={r.id} className="border-b border-border hover:bg-muted/10">
                          <td className="p-3 font-mono text-xs">{r.id}</td>
                          <td className="p-3">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="p-3">{r.conflictPolicy}</td>
                          <td className="p-3">{formatDate(r.startedAt)}</td>
                          <td className="p-3">{formatDate(r.completedAt)}</td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">
                            {r.planHash ? `${r.planHash.slice(0, 12)}…` : "—"}
                          </td>
                          <td className="p-3 font-mono text-xs">
                            {r.artifactId ? (
                              <span className="text-primary hover:underline">{r.artifactId.slice(0, 8)}…</span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-border p-3 text-sm">
                  <span>{restores.length} total restore records</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restorePage === 1}
                      onClick={() => setRestorePage((page) => page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restorePage * 10 >= restores.length}
                      onClick={() => setRestorePage((page) => page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL: CREATE / EDIT SCHEDULED JOB ─────────────────────── */}
        {showJobModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 space-y-4 shadow-xl">
              <h3 className="font-semibold text-lg">
                {editingJob ? `Edit Job: ${editingJob.name}` : "Create Scheduled Backup Job"}
              </h3>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Job Name</label>
                  <Input
                    value={jobFormName}
                    onChange={(e) => setJobFormName(e.target.value)}
                    placeholder="e.g. Daily Core Database"
                  />
                </div>

                <div className="grid gap-3 grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Frequency</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={jobFormFrequency}
                      onChange={(e) => setJobFormFrequency(e.target.value)}
                    >
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Time of Day</label>
                    <Input
                      type="time"
                      value={jobFormTime}
                      onChange={(e) => setJobFormTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Timezone</label>
                    <Input
                      value={jobFormTimezone}
                      onChange={(e) => setJobFormTimezone(e.target.value)}
                      placeholder="e.g. UTC"
                    />
                  </div>
                </div>

                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Retention Max Count</label>
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={jobFormRetentionCount}
                      onChange={(e) =>
                        setJobFormRetentionCount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      placeholder="e.g. 30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Retention Max Age (Days)</label>
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      value={jobFormRetentionDays}
                      onChange={(e) =>
                        setJobFormRetentionDays(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      placeholder="e.g. 90"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Retry Limit (Attempts)</label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={jobFormRetryLimit}
                    onChange={(e) => setJobFormRetryLimit(Number(e.target.value))}
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-border">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={jobFormNotifySuccess}
                      onChange={(e) => setJobFormNotifySuccess(e.target.checked)}
                    />
                    <span>Send email notification on successful backup run</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={jobFormNotifyFailure}
                      onChange={(e) => setJobFormNotifyFailure(e.target.checked)}
                    />
                    <span>Send email notification on retry or permanent failure</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => setShowJobModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleSaveJob()}
                  disabled={busy}
                >
                  {busy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingJob ? "Save Changes" : "Create Job"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-1">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-sm font-medium">{title}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}
