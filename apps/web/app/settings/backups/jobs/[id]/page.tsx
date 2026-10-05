"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock3, Play, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PermissionGuard } from "@/lib/auth/auth-context";
import { backupsApi, type BackupJobDetails } from "@/lib/api/backups-api";

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function BackupJobDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [details, setDetails] = React.useState<BackupJobDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setDetails(await backupsApi.jobDetails(params.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load job.");
    }
  }, [params.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>;
  }
  if (!details) {
    return <div className="p-6 text-sm text-muted-foreground">Loading job…</div>;
  }

  const { job, health, runs } = details;
  return (
    <PermissionGuard permission="Administration.Settings">
      <div className="space-y-6">
        <Link href="/settings/backups" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Backup & Restore
        </Link>
        <PageHeader
          title={job.name}
          description={`${job.frequency} at ${job.timeOfDay} (${job.timezone})`}
        />
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={job.enabled ? "ACTIVE" : "PAUSED"} />
          <Button size="sm" onClick={() => void backupsApi.runJob(job.id).then(load)}>
            <Play className="mr-2 h-4 w-4" /> Run now
          </Button>
          <Button size="sm" variant="outline" onClick={() => void backupsApi.setJobEnabled(job.id, !job.enabled).then(load)}>
            {job.enabled ? "Pause" : "Resume"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (window.confirm(`Delete "${job.name}"?`)) {
                void backupsApi.deleteJob(job.id).then(() => router.push("/settings/backups"));
              }
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        </div>
        <section className="grid gap-4 md:grid-cols-4">
          <Metric label="Next run" value={formatDate(job.nextRunAt)} />
          <Metric label="Success rate" value={`${Math.round(health.successRate * 100)}%`} />
          <Metric label="Average duration" value={`${Math.round(health.averageDurationMs / 1000)}s`} />
          <Metric label="Average size" value={`${Math.round(health.averageBackupSize / 1024)} KB`} />
        </section>
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">Configuration</h2>
          <dl className="grid gap-3 text-sm md:grid-cols-3">
            <Metric label="Scope" value={JSON.stringify(job.scope)} />
            <Metric label="Encryption" value={job.encrypted ? "Enabled" : "Disabled"} />
            <Metric label="Retention" value={`${job.retentionMaxCount ?? "∞"} backups / ${job.retentionMaxAgeDays ?? "∞"} days`} />
            <Metric label="Retry policy" value={`${job.retryLimit} retries, ${job.retryInitialDelaySeconds}s initial delay`} />
            <Metric label="Last successful run" value={formatDate((health.lastSuccessfulRun as { endedAt?: string } | null)?.endedAt)} />
            <Metric label="Last failed run" value={formatDate((health.lastFailedRun as { endedAt?: string } | null)?.endedAt)} />
          </dl>
        </section>
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">Run history</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-2">Run</th><th className="p-2">Status</th><th className="p-2">Attempt</th><th className="p-2">Started</th><th className="p-2">Completed</th><th className="p-2">Error</th></tr></thead>
              <tbody>{runs.map((run) => <tr key={run.id} className="border-b border-border"><td className="p-2 font-mono text-xs">{run.id}</td><td className="p-2"><StatusBadge status={run.status} /></td><td className="p-2">{run.attempt}</td><td className="p-2">{formatDate(run.startedAt)}</td><td className="p-2">{formatDate(run.endedAt)}</td><td className="p-2 text-destructive">{run.errorMessage ?? "—"}</td></tr>)}</tbody>
            </table>
          </div>
          {!runs.length && <div className="py-8 text-center text-sm text-muted-foreground"><Clock3 className="mx-auto mb-2 h-4 w-4" />No runs yet.</div>}
        </section>
      </div>
    </PermissionGuard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>;
}
