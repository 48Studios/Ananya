"use client";

import * as React from "react";
import Link from "next/link";
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionGuard } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  backupsApi,
  type BackupArtifact,
  type BackupJob,
  type RestoreOperation,
} from "@/lib/api/backups-api";

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function BackupRestorePage() {
  const [artifacts, setArtifacts] = React.useState<BackupArtifact[]>([]);
  const [jobs, setJobs] = React.useState<BackupJob[]>([]);
  const [restores, setRestores] = React.useState<RestoreOperation[]>([]);
  const [restoreSearch, setRestoreSearch] = React.useState("");
  const [restorePage, setRestorePage] = React.useState(1);
  const [tab, setTab] = React.useState<
    "overview" | "backups" | "jobs" | "restores"
  >("overview");
  const [name, setName] = React.useState("Manual backup");
  const [encrypted, setEncrypted] = React.useState(false);
  const [passphrase, setPassphrase] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [restoreFile, setRestoreFile] = React.useState<File | null>(null);
  const [restorePassphrase, setRestorePassphrase] = React.useState("");
  const [conflictPolicy, setConflictPolicy] = React.useState<
    "SKIP" | "UPDATE" | "ABORT"
  >("ABORT");
  const [restorePreview, setRestorePreview] = React.useState<Record<
    string,
    unknown
  > | null>(null);
  const [jobName, setJobName] = React.useState("");
  const [jobTime, setJobTime] = React.useState("02:00");
  const [jobTimezone, setJobTimezone] = React.useState("UTC");
  const [jobFrequency, setJobFrequency] = React.useState("DAILY");

  const load = React.useCallback(async () => {
    const [nextArtifacts, nextJobs, nextRestores] = await Promise.all([
      backupsApi.artifacts(),
      backupsApi.jobs(),
      backupsApi.restores(),
    ]);
    setArtifacts(nextArtifacts);
    setJobs(nextJobs);
    setRestores(nextRestores);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function createBackup() {
    setBusy(true);
    setMessage(null);
    try {
      await backupsApi.create({
        name,
        type: "FULL",
        encrypted,
        ...(encrypted ? { passphrase } : {}),
      });
      setMessage("Backup created and integrity checksum recorded.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Backup creation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string, fileName: string) {
    const blob = await backupsApi.download(id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}.archive`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function previewRestore() {
    if (!restoreFile) return;
    const form = new FormData();
    form.append("file", restoreFile);
    if (restorePassphrase) form.append("passphrase", restorePassphrase);
    setRestorePreview(await backupsApi.previewRestore(form));
  }

  async function restore() {
    if (
      !restoreFile ||
      !window.confirm(
        "This creates a safety backup and may change production data. Continue?",
      )
    ) {
      return;
    }
    const form = new FormData();
    form.append("file", restoreFile);
    form.append("passphrase", restorePassphrase);
    form.append("conflictPolicy", conflictPolicy);
    form.append("confirmDestructive", "true");
    setMessage(JSON.stringify(await backupsApi.restore(form)));
  }

  return (
    <PermissionGuard permission="Administration.Settings">
      <div className="space-y-6">
        <PageHeader
          title="Backup & Restore"
          description="Create verified system archives, manage durable schedules, and review recovery history."
        />
        {message && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
            {message}
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto border-b border-border pb-2">
          {(["overview", "backups", "jobs", "restores"] as const).map(
            (item) => (
              <Button
                key={item}
                variant={tab === item ? "default" : "ghost"}
                size="sm"
                onClick={() => setTab(item)}
              >
                {item === "overview"
                  ? "Overview"
                  : item === "backups"
                    ? "Backups"
                    : item === "jobs"
                      ? "Scheduled Jobs"
                      : "Restore History"}
              </Button>
            ),
          )}
        </div>

        {tab === "overview" && (
          <div className="grid gap-4 md:grid-cols-3">
            <Metric
              title="Total backups"
              value={String(artifacts.length)}
              icon={<Archive className="h-4 w-4" />}
            />
            <Metric
              title="Storage consumed"
              value={formatBytes(
                artifacts.reduce((total, item) => total + item.sizeBytes, 0),
              )}
              icon={<Download className="h-4 w-4" />}
            />
            <Metric
              title="Scheduled jobs"
              value={String(jobs.filter((job) => job.enabled).length)}
              icon={<CalendarClock className="h-4 w-4" />}
            />
          </div>
        )}

        {tab === "backups" && (
          <section className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Create a backup</h2>
                  <p className="text-sm text-muted-foreground">
                    Full database and document storage archive.
                  </p>
                </div>
                <Plus className="h-4 w-4 text-muted-foreground" />
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
                    encrypted ? "Encryption passphrase" : "Optional passphrase"
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
                onClick={() => void createBackup()}
                disabled={busy || (encrypted && passphrase.length < 8)}
              >
                {busy ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                Create backup
              </Button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3">Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">Status</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {artifacts.map((artifact) => (
                    <tr
                      key={artifact.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="p-3 font-medium">{artifact.name}</td>
                      <td className="p-3">
                        {artifact.type}
                        {artifact.encrypted ? " · encrypted" : ""}
                      </td>
                      <td className="p-3">
                        {new Date(artifact.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3">{formatBytes(artifact.sizeBytes)}</td>
                      <td className="p-3">
                        <StatusBadge status={artifact.status} />
                      </td>
                      <td className="p-3 text-right">
                        {artifact.status === "COMPLETED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void download(artifact.id, artifact.name)
                            }
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void backupsApi.remove(artifact.id).then(load)
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!artifacts.length && (
                <div className="p-8 text-center text-muted-foreground">
                  No backups have been created.
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "jobs" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="font-semibold">Create scheduled backup</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <Input
                  value={jobName}
                  onChange={(event) => setJobName(event.target.value)}
                  placeholder="Job name"
                />
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={jobFrequency}
                  onChange={(event) => setJobFrequency(event.target.value)}
                >
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
                <Input
                  type="time"
                  value={jobTime}
                  onChange={(event) => setJobTime(event.target.value)}
                />
                <Input
                  value={jobTimezone}
                  onChange={(event) => setJobTimezone(event.target.value)}
                  placeholder="IANA timezone, e.g. UTC"
                />
              </div>
              <Button
                disabled={!jobName.trim()}
                onClick={() =>
                  void backupsApi
                    .createJob({
                      name: jobName.trim(),
                      frequency: jobFrequency,
                      timeOfDay: jobTime,
                      timezone: jobTimezone,
                      scope: { includeDatabase: true, includeFiles: true },
                      encrypted: false,
                      retryLimit: 2,
                      notifyOnFailure: true,
                    })
                    .then(() => {
                      setJobName("");
                      return load();
                    })
                }
              >
                <Plus className="mr-2 h-4 w-4" /> Create job
              </Button>
            </div>
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div>
                  <Link href={`/settings/backups/jobs/${job.id}`} className="font-medium hover:underline">{job.name}</Link>
                  <div className="text-sm text-muted-foreground">
                    {job.frequency} at {job.timeOfDay} ({job.timezone}) · next{" "}
                    {job.nextRunAt
                      ? new Date(job.nextRunAt).toLocaleString()
                      : "not scheduled"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <StatusBadge status={job.enabled ? "ACTIVE" : "PAUSED"} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void backupsApi.runJob(job.id).then(load)}
                  >
                    <Clock3 className="mr-1 h-4 w-4" />
                    Run now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void backupsApi
                        .setJobEnabled(job.id, !job.enabled)
                        .then(load)
                    }
                  >
                    {job.enabled ? (
                      <XCircle className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (
                        window.confirm(`Delete scheduled job "${job.name}"?`)
                      ) {
                        void backupsApi.deleteJob(job.id).then(load);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {!jobs.length && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                No scheduled jobs configured.
              </div>
            )}
          </div>
        )}
        {tab === "restores" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Input
                value={restoreSearch}
                onChange={(event) => {
                  setRestoreSearch(event.target.value);
                  setRestorePage(1);
                }}
                placeholder="Search restore ID or status"
              />
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-3">Restore ID</th><th className="p-3">Status</th><th className="p-3">Conflict policy</th><th className="p-3">Started</th><th className="p-3">Completed</th><th className="p-3">Plan hash</th></tr></thead>
                <tbody>
                  {restores
                    .filter((restore) => `${restore.id} ${restore.status}`.toLowerCase().includes(restoreSearch.toLowerCase()))
                    .slice((restorePage - 1) * 10, restorePage * 10)
                    .map((restore) => (
                      <tr key={restore.id} className="border-b border-border">
                        <td className="p-3 font-mono text-xs">{restore.id}</td>
                        <td className="p-3"><StatusBadge status={restore.status} /></td>
                        <td className="p-3">{restore.conflictPolicy}</td>
                        <td className="p-3">{restore.startedAt ? new Date(restore.startedAt).toLocaleString() : "—"}</td>
                        <td className="p-3">{restore.completedAt ? new Date(restore.completedAt).toLocaleString() : "—"}</td>
                        <td className="p-3 font-mono text-xs">{restore.planHash ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-border p-3 text-sm">
                <span>{restores.length} restore operations</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={restorePage === 1} onClick={() => setRestorePage((page) => page - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={restorePage * 10 >= restores.length} onClick={() => setRestorePage((page) => page + 1)}>Next</Button>
                </div>
              </div>
            </div>
            <div className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Validate and restore an archive</h2>
              <p className="text-sm text-muted-foreground">
                Preview before explicit destructive confirmation. A pre-restore
                safety backup is created automatically.
              </p>
              <Input
                type="file"
                onChange={(event) =>
                  setRestoreFile(event.target.files?.[0] ?? null)
                }
              />
              <Input
                type="password"
                placeholder="Passphrase (if encrypted)"
                value={restorePassphrase}
                onChange={(event) => setRestorePassphrase(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {(["SKIP", "UPDATE", "ABORT"] as const).map((policy) => (
                  <Button
                    key={policy}
                    variant={conflictPolicy === policy ? "default" : "outline"}
                    onClick={() => setConflictPolicy(policy)}
                  >
                    {policy}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => void previewRestore()}
                  disabled={!restoreFile}
                >
                  Preview
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void restore()}
                  disabled={!restoreFile}
                >
                  Restore
                </Button>
              </div>
              {restorePreview && (
                <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(restorePreview, null, 2)}
                </pre>
              )}
            </div>
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
              Completed restore operations retain their safety-backup reference,
              warnings, and verification result.
            </div>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}

function Metric({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{title}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  );
}
