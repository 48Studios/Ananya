"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock3, Edit2, Play, RefreshCw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { PermissionGuard, useAuth } from "@/lib/auth/auth-context";
import { backupsApi, type BackupJobDetails } from "@/lib/api/backups-api";

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function BackupJobDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [details, setDetails] = React.useState<BackupJobDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [showEditModal, setShowEditModal] = React.useState(false);

  // Edit form state
  const [editName, setEditName] = React.useState("");
  const [editFrequency, setEditFrequency] = React.useState("DAILY");
  const [editTime, setEditTime] = React.useState("02:00");
  const [editTimezone, setEditTimezone] = React.useState("UTC");
  const [editRetentionCount, setEditRetentionCount] = React.useState<number | "">(30);
  const [editRetentionDays, setEditRetentionDays] = React.useState<number | "">(90);
  const [editRetryLimit, setEditRetryLimit] = React.useState<number>(2);
  const [editNotifySuccess, setEditNotifySuccess] = React.useState(true);
  const [editNotifyFailure, setEditNotifyFailure] = React.useState(true);

  const canCreate = hasPermission("Administration.Backups.Create") || hasPermission("Administration.Settings");
  const canRun = hasPermission("Administration.Backups.Run") || hasPermission("Administration.Settings");
  const canDelete = hasPermission("Administration.Backups.Delete") || hasPermission("Administration.Settings");

  const load = React.useCallback(async () => {
    try {
      const data = await backupsApi.jobDetails(params.id);
      setDetails(data);
      setEditName(data.job.name);
      setEditFrequency(data.job.frequency);
      setEditTime(data.job.timeOfDay);
      setEditTimezone(data.job.timezone);
      setEditRetentionCount(data.job.retentionMaxCount ?? 30);
      setEditRetentionDays(data.job.retentionMaxAgeDays ?? 90);
      setEditRetryLimit(data.job.retryLimit ?? 2);
      setEditNotifySuccess(data.job.notifyOnSuccess ?? true);
      setEditNotifyFailure(data.job.notifyOnFailure ?? true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load job.");
    }
  }, [params.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveEdit() {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await backupsApi.updateJob(params.id, {
        name: editName.trim(),
        frequency: editFrequency,
        timeOfDay: editTime,
        timezone: editTimezone.trim() || "UTC",
        retentionMaxCount: editRetentionCount === "" ? null : Number(editRetentionCount),
        retentionMaxAgeDays: editRetentionDays === "" ? null : Number(editRetentionDays),
        retryLimit: Number(editRetryLimit),
        notifyOnSuccess: editNotifySuccess,
        notifyOnFailure: editNotifyFailure,
      });
      setShowEditModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update job.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>;
  }
  if (!details) {
    return <div className="p-6 text-sm text-muted-foreground">Loading scheduled job…</div>;
  }

  const { job, health, runs } = details;
  return (
    <PermissionGuard permission="Administration.Backups.Read">
      <div className="space-y-6">
        <Link
          href="/settings/backups"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Backup & Restore
        </Link>

        <PageHeader
          title={job.name}
          description={`${job.frequency} at ${job.timeOfDay} (${job.timezone}) · next scheduled run: ${formatDate(job.nextRunAt)}`}
        />

        <div className="flex flex-wrap gap-2">
          <StatusBadge status={job.enabled ? "ACTIVE" : "PAUSED"} />
          {canRun && (
            <Button
              size="sm"
              onClick={() => void backupsApi.runJob(job.id).then(load)}
            >
              <Play className="mr-2 h-4 w-4" /> Run now
            </Button>
          )}
          {canCreate && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowEditModal(true)}
              >
                <Edit2 className="mr-2 h-4 w-4" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void backupsApi.setJobEnabled(job.id, !job.enabled).then(load)
                }
              >
                {job.enabled ? "Pause schedule" : "Resume schedule"}
              </Button>
            </>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (window.confirm(`Delete scheduled job "${job.name}"?`)) {
                  void backupsApi
                    .deleteJob(job.id)
                    .then(() => router.push("/settings/backups"));
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )}
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <Metric label="Next Run" value={formatDate(job.nextRunAt)} />
          <Metric
            label="Success Rate"
            value={`${Math.round(health.successRate * 100)}%`}
          />
          <Metric
            label="Average Duration"
            value={`${Math.round(health.averageDurationMs / 1000)}s`}
          />
          <Metric
            label="Average Backup Size"
            value={formatBytes(health.averageBackupSize)}
          />
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold text-base">Configuration & Retention</h2>
          <dl className="grid gap-4 text-sm md:grid-cols-3">
            <Metric
              label="Scope"
              value={
                job.scope?.tables && Array.isArray(job.scope.tables) && job.scope.tables.length > 0
                  ? `Selective: ${job.scope.tables.join(", ")}`
                  : "Full database & documents"
              }
            />
            <Metric
              label="Encryption"
              value={job.encrypted ? "AES-256-GCM" : "Unencrypted"}
            />
            <Metric
              label="Retention Policy"
              value={`${job.retentionMaxCount ?? "Unlimited"} backups / ${job.retentionMaxAgeDays ?? "Unlimited"} days`}
            />
            <Metric
              label="Retry Policy"
              value={`${job.retryLimit} retries (${job.retryInitialDelaySeconds}s initial delay, max ${job.retryMaxDelaySeconds}s)`}
            />
            <Metric
              label="Notifications"
              value={`Success: ${job.notifyOnSuccess ? "Yes" : "No"} · Failure: ${job.notifyOnFailure ? "Yes" : "No"}`}
            />
            <Metric
              label="Last Result"
              value={`${job.lastResult ?? "No runs"} (${formatDate(job.lastRunAt)})`}
            />
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold text-base">Run History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3">Run ID</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Attempt</th>
                  <th className="p-3">Started</th>
                  <th className="p-3">Completed</th>
                  <th className="p-3">Artifact</th>
                  <th className="p-3">Error / Reason</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-border hover:bg-muted/10">
                    <td className="p-3 font-mono text-xs">{run.id}</td>
                    <td className="p-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="p-3">{run.attempt}</td>
                    <td className="p-3">{formatDate(run.startedAt)}</td>
                    <td className="p-3">{formatDate(run.endedAt)}</td>
                    <td className="p-3 font-mono text-xs">
                      {run.artifactId ? (
                        <span className="text-primary">{run.artifactId.slice(0, 8)}…</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-destructive text-xs">
                      {run.errorMessage ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!runs.length && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Clock3 className="mx-auto mb-2 h-4 w-4" />
              No runs recorded for this scheduled job yet.
            </div>
          )}
        </section>

        {/* Edit Modal */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 space-y-4 shadow-xl">
              <h3 className="font-semibold text-lg">Edit Job: {job.name}</h3>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Job Name</label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>

                <div className="grid gap-3 grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Frequency</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={editFrequency}
                      onChange={(e) => setEditFrequency(e.target.value)}
                    >
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Time</label>
                    <Input
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Timezone</label>
                    <Input
                      value={editTimezone}
                      onChange={(e) => setEditTimezone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Retention Max Count</label>
                    <Input
                      type="number"
                      value={editRetentionCount}
                      onChange={(e) =>
                        setEditRetentionCount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Retention Max Age (Days)</label>
                    <Input
                      type="number"
                      value={editRetentionDays}
                      onChange={(e) =>
                        setEditRetentionDays(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Retry Limit</label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={editRetryLimit}
                    onChange={(e) => setEditRetryLimit(Number(e.target.value))}
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-border">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={editNotifySuccess}
                      onChange={(e) => setEditNotifySuccess(e.target.checked)}
                    />
                    <span>Email on success</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={editNotifyFailure}
                      onChange={(e) => setEditNotifyFailure(e.target.checked)}
                    />
                    <span>Email on retry / failure</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void handleSaveEdit()} disabled={busy}>
                  {busy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}
