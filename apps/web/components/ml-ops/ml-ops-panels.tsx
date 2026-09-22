"use client";

import * as React from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  History,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  Rocket,
  Sparkles,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DetailField,
  DetailFields,
  DetailMono,
  DetailText,
} from "@/components/ui/detail-field";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  DeploymentStatus,
  MlDatasetDto,
  MlDeploymentRecordDto,
  MlModelsDto,
  MlOverviewDto,
  MlTrainingRunDetailDto,
  MlTrainingRunSummaryDto,
  MlUsageDto,
  TrainingRunStatus,
} from "@/lib/api/ml-ops-api";
import {
  TRAINING_PHASE_SEQUENCE,
  TRAINING_SCOPE_NOTICE,
  canDeployCandidate,
  canRollback,
  datasetFreshnessNote,
  datasetQualityRows,
  datasetUnavailableReason,
  deployConfirmation,
  deployUnavailableReason,
  deploymentStatusDetail,
  deploymentStatusLabel,
  emptyStateFor,
  evaluationMetricRows,
  formatChecksum,
  formatCount,
  formatDateTime,
  formatDuration,
  formatMetric,
  formatVersion,
  gateLabel,
  gateSummaryNote,
  healthExplanation,
  healthLabel,
  healthTone,
  phaseStepState,
  retrainConfirmation,
  retrainUnavailableReason,
  rollbackConfirmation,
  rollbackUnavailableReason,
  trainingErrorExplanation,
  trainingPhaseLabel,
  trainingStatusLabel,
  usageHeadlineCounts,
} from "@/lib/ml-ops";

/**
 * ML & Intelligence panels.
 *
 * Presentational only: every value comes from a server response, and anything the
 * server did not report renders as "Not available" rather than as a zero. No panel
 * estimates progress, and none of them claims a deployment took effect — the running
 * model version is always shown next to the deployed artifact version.
 */

/** Status → the canonical badge vocabulary, reusing the app's existing badges. */
function runStatusBadge(status: TrainingRunStatus) {
  const mapped =
    status === "PASSED"
      ? "ACTIVE"
      : status === "RUNNING" || status === "EVALUATING"
        ? "IN_PROGRESS"
        : status === "FAILED" || status === "REJECTED"
          ? "FAILED"
          : status === "CANCELLED"
            ? "CANCELLED"
            : "PENDING";
  return <StatusBadge status={mapped} label={trainingStatusLabel(status)} />;
}

function deploymentBadge(status: DeploymentStatus) {
  if (status === "DEPLOYED") {
    return <StatusBadge status="ACTIVE" label="Deployed" />;
  }
  if (status === "DEPLOYED_PENDING_RELOAD") {
    return <StatusBadge status="PENDING" label="Reload pending" />;
  }
  if (status === "DEPLOYMENT_FAILED") {
    return <StatusBadge status="FAILED" label="Deployment failed" />;
  }
  return <StatusBadge status="INACTIVE" label="Not deployed" />;
}

/**
 * Every labelled value in these panels uses the shared `DetailField` vocabulary.
 */
function MetricGrid({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No evaluation metrics were recorded for this run.
      </p>
    );
  }
  return (
    <DetailFields className="gap-y-4 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((row) => (
        <DetailField key={row.label} label={row.label}>
          <DetailMono className="text-sm">{row.value}</DetailMono>
        </DetailField>
      ))}
    </DetailFields>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function MlOverviewPanel({
  overview,
  canWrite,
  onRetrain,
  onViewRun,
  onDeployCandidate,
  busy,
}: {
  overview: MlOverviewDto;
  canWrite: boolean;
  onRetrain: () => void;
  onViewRun: (runId: string) => void;
  onDeployCandidate: (runId: string) => void;
  busy: boolean;
}) {
  const tone = healthTone(overview.health);
  const retrainBlocked = retrainUnavailableReason({
    health: overview.health,
    activeRunId: overview.health.activeTrainingRunId,
    canWrite,
  });
  const latestRun = overview.latestRun;
  const candidate = overview.candidate;

  return (
    <div className="space-y-6">
      <SectionCard
        title="ML & Intelligence"
        description={healthExplanation(overview.health)}
        icon={Sparkles}
        actions={
          <div className="flex items-center gap-4">
            <span
              className={
                tone === "healthy"
                  ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                  : tone === "degraded"
                    ? "text-xs font-medium text-amber-600 dark:text-amber-400"
                    : "text-xs font-medium text-destructive"
              }
            >
              Service: {healthLabel(tone)}
            </span>
            <Button
              size="sm"
              onClick={onRetrain}
              disabled={busy || retrainBlocked !== null}
              title={retrainBlocked ?? "Start a training run"}
            >
              <Sparkles data-icon="inline-start" />
              Retrain Model
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <DetailFields>
            <DetailField label="Running model">
              <DetailMono className="text-sm">
                {formatVersion(overview.health.runningModelVersion)}
              </DetailMono>
            </DetailField>
            <DetailField label="Category model">
              <DetailText>
                {overview.health.categoryModelLoaded ? "Loaded" : "Not loaded"}
              </DetailText>
            </DetailField>
            <DetailField label="Manufacturer resolver">
              <DetailText>
                {overview.health.manufacturerResolverLoaded
                  ? "Loaded"
                  : "Not loaded"}
              </DetailText>
            </DetailField>
            <DetailField label="Active training run">
              {overview.health.activeTrainingRunId ? (
                <button
                  type="button"
                  className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                  onClick={() =>
                    onViewRun(overview.health.activeTrainingRunId as string)
                  }
                >
                  View run
                </button>
              ) : (
                <DetailText>None</DetailText>
              )}
            </DetailField>
          </DetailFields>
          {/*
            The note that governs the button above it.

            `Info` icon per the application's note convention (the component
            finding dialog's consequence line). Both branches carry it: they are the
            same slot, so an icon that appeared and disappeared with the button's
            state would read as two different kinds of message.
          */}
          {retrainBlocked ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" />
              {retrainBlocked}
            </p>
          ) : (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" />
              {TRAINING_SCOPE_NOTICE}
            </p>
          )}
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Feedback" value={formatCount(overview.counts.feedback)} />
        <StatCard title="Findings" value={formatCount(overview.counts.findings)} />
        <StatCard
          title="Training Runs"
          value={formatCount(overview.counts.trainingRuns)}
        />
        <StatCard
          title="Deployed Models"
          value={formatCount(overview.counts.deployedModels)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Production Model" icon={Layers}>
          {overview.productionModel ? (
            <div className="space-y-4">
              <DetailFields className="lg:grid-cols-2 xl:grid-cols-2">
                <DetailField label="Artifact version">
                  <DetailMono className="text-sm">
                    {formatVersion(overview.productionModel.artifactVersion)}
                  </DetailMono>
                </DetailField>
                <DetailField label="Running version">
                  <DetailMono className="text-sm">
                    {formatVersion(overview.productionModel.runningVersion)}
                  </DetailMono>
                  {overview.productionModel.reloadPending ? (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      reload pending
                    </p>
                  ) : null}
                </DetailField>
                <DetailField label="Deployed">
                  <DetailText>
                    {formatDateTime(overview.productionModel.deployedAt)}
                  </DetailText>
                </DetailField>
                <DetailField label="Dataset">
                  <DetailText>
                    {overview.productionModel.datasetVersion ?? "Not available"}
                  </DetailText>
                </DetailField>
                <DetailField label="Status">
                  <DetailText>
                    {overview.productionModel.status === "RUNNING"
                      ? "Running"
                      : overview.productionModel.status === "RELOAD_PENDING"
                        ? "Artifact deployed, reload pending"
                        : "Unknown"}
                  </DetailText>
                </DetailField>
              </DetailFields>
            </div>
          ) : (
            <EmptyState {...emptyStateFor("overview")} compact />
          )}
        </SectionCard>

        <SectionCard
          title="Latest Training"
          icon={History}
          actions={
            latestRun ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onViewRun(latestRun.id)}
              >
                View Run
              </Button>
            ) : null
          }
        >
          {latestRun ? (
            <div className="space-y-4">
              <DetailFields className="lg:grid-cols-2 xl:grid-cols-2">
                <DetailField label="Status">
                  {runStatusBadge(latestRun.status)}
                </DetailField>
                <DetailField label="Candidate">
                  <DetailMono className="text-sm">
                    {formatVersion(latestRun.candidateModelVersion)}
                  </DetailMono>
                </DetailField>
                <DetailField label="Dataset">
                  <DetailText>
                    {latestRun.datasetVersion ?? "Not available"}
                  </DetailText>
                </DetailField>
                <DetailField label="Triggered">
                  <DetailText>{formatDateTime(latestRun.triggeredAt)}</DetailText>
                </DetailField>
                <DetailField label="Evaluation">
                  <DetailText>
                    {latestRun.promotionEligible === null
                      ? "Not available"
                      : latestRun.promotionEligible
                        ? "PASSED"
                        : "FAILED"}
                  </DetailText>
                </DetailField>
                <DetailField label="Deployment">
                  <DetailText>
                    {deploymentStatusLabel(latestRun.deploymentStatus)}
                  </DetailText>
                </DetailField>
              </DetailFields>
              {candidate && canDeployCandidate(latestRun) ? (
                <Button
                  size="sm"
                  onClick={() => onDeployCandidate(candidate.runId)}
                  disabled={busy}
                >
                  <Rocket data-icon="inline-start" />
                  Deploy Candidate
                </Button>
              ) : candidate ? (
                <p className="text-xs text-muted-foreground">
                  {deployUnavailableReason(latestRun)}
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState {...emptyStateFor("runs")} compact />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Current Dataset" icon={Database}>
        {overview.dataset ? (
          <DetailFields>
            <DetailField label="Version">
              <DetailMono className="text-sm">{overview.dataset.version}</DetailMono>
            </DetailField>
            <DetailField label="Generated">
              <DetailText>{formatDateTime(overview.dataset.generatedAt)}</DetailText>
            </DetailField>
            <DetailField label="Records">
              <DetailMono className="text-sm">
                {formatCount(overview.dataset.totalRecords)}
              </DetailMono>
            </DetailField>
            <DetailField label="Validated">
              <DetailMono className="text-sm">
                {formatCount(overview.dataset.validatedRecords)}
              </DetailMono>
            </DetailField>
            <DetailField label="Quarantined">
              <DetailMono className="text-sm">
                {formatCount(overview.dataset.quarantinedRecords)}
              </DetailMono>
            </DetailField>
            <DetailField label="Training records">
              <DetailMono className="text-sm">
                {formatCount(overview.dataset.trainingRecords)}
              </DetailMono>
            </DetailField>
            <DetailField label="Evaluation records">
              <DetailMono className="text-sm">
                {formatCount(overview.dataset.evaluationRecords)}
              </DetailMono>
            </DetailField>
            <DetailField label="Snapshot fingerprint">
              <DetailMono>
                {formatChecksum(overview.dataset.fingerprint)}
              </DetailMono>
            </DetailField>
          </DetailFields>
        ) : (
          <EmptyState {...emptyStateFor("datasets")} compact />
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active run
// ---------------------------------------------------------------------------

export function MlActiveRunPanel({
  run,
  onViewRun,
}: {
  run: MlTrainingRunSummaryDto | null;
  onViewRun: (runId: string) => void;
}) {
  if (!run) return null;
  const phase = trainingPhaseLabel(run.phase);

  return (
    <SectionCard
      title="Training in progress"
      icon={Loader2}
      description="The pipeline runs on the ML service. Closing this page does not stop it."
      actions={
        <Button size="sm" variant="outline" onClick={() => onViewRun(run.id)}>
          View Run
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-primary" />
            {runStatusBadge(run.status)}
          </span>
          <span className="text-muted-foreground">
            Candidate {formatVersion(run.candidateModelVersion)}
          </span>
          <span className="text-muted-foreground">
            Started {formatDateTime(run.startedAt ?? run.triggeredAt)}
          </span>
        </div>
        {/* Step indicator, not a progress bar: the pipeline reports phase
            boundaries, not fractions of work. */}
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {TRAINING_PHASE_SEQUENCE.map((step) => {
            const state = phaseStepState(run.phase, step);
            return (
              <li key={step} className="flex items-center gap-2 text-xs">
                {state === "done" ? (
                  <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : state === "current" ? (
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                ) : (
                  <Clock className="size-3.5 text-muted-foreground" />
                )}
                <span
                  className={
                    state === "pending"
                      ? "text-muted-foreground"
                      : "font-medium text-foreground"
                  }
                >
                  {trainingPhaseLabel(step)}
                </span>
              </li>
            );
          })}
        </ol>
        {phase ? (
          <p className="text-xs text-muted-foreground">Current phase: {phase}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          A running job cannot be cancelled safely, so no cancel control is offered.
        </p>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export function MlModelsPanel({
  models,
  busy,
  canWrite,
  onRollback,
  onReload,
  onDeployRun,
}: {
  models: MlModelsDto;
  busy: boolean;
  canWrite: boolean;
  onRollback: () => void;
  onReload: () => void;
  onDeployRun: (runId: string, candidateVersion: string | null) => void;
}) {
  const rollbackBlocked = rollbackUnavailableReason(models);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Production Model"
        icon={Layers}
        description="The artifact on disk and the model the running process is serving are reported separately."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onReload}
              disabled={busy || !models.available}
              title="Re-read the production artifact into the running ML process"
            >
              <RefreshCw data-icon="inline-start" />
              Reload Running Model
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onRollback}
              disabled={busy || !canWrite || !canRollback(models)}
              title={
                canWrite
                  ? (rollbackBlocked ?? "Restore the previous production artifact")
                  : "You do not have permission to manage model deployment."
              }
            >
              <Undo2 data-icon="inline-start" />
              Rollback
            </Button>
          </div>
        }
      >
        {models.available ? (
          <div className="space-y-4">
            <DetailFields>
              <DetailField label="Deployed artifact">
                <DetailMono className="text-sm">
                  {formatVersion(models.production.artifactVersion)}
                </DetailMono>
              </DetailField>
              <DetailField label="Running model">
                <DetailMono className="text-sm">
                  {formatVersion(models.running.version)}
                </DetailMono>
              </DetailField>
              <DetailField label="Reload state">
                {models.running.reloadPending ? (
                  <span className="text-sm text-amber-600 dark:text-amber-400">
                    Artifact deployed, reload pending
                  </span>
                ) : (
                  <DetailText>
                    Running model matches the deployed artifact
                  </DetailText>
                )}
              </DetailField>
              <DetailField label="Deployed at">
                <DetailText>{formatDateTime(models.production.deployedAt)}</DetailText>
              </DetailField>
              <DetailField label="Artifact checksum">
                <DetailMono>{formatChecksum(models.production.checksum)}</DetailMono>
              </DetailField>
              <DetailField label="Running checksum">
                <DetailMono>{formatChecksum(models.running.checksum)}</DetailMono>
              </DetailField>
              <DetailField label="Deployment record">
                <DetailText>
                  {models.production.recordedVersion
                    ? formatVersion(models.production.recordedVersion)
                    : "Not available"}
                </DetailText>
              </DetailField>
            </DetailFields>
            {rollbackBlocked && models.available ? (
              <p className="text-xs text-muted-foreground">{rollbackBlocked}</p>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="Model registry unavailable"
            description="The ML service is unreachable, so no model information is available."
            compact
          />
        )}
      </SectionCard>

      <SectionCard
        title="Model Versions"
        icon={Boxes}
        contentClassName="p-0"
        description="Every candidate the registry holds, newest first."
      >
        {models.versions.length === 0 ? (
          <div className="p-6">
            <EmptyState {...emptyStateFor("models")} compact />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Version</th>
                  <th className="px-6 py-3 font-medium">Trained</th>
                  <th className="px-6 py-3 font-medium">Architecture</th>
                  <th className="px-6 py-3 font-medium">Top-1</th>
                  <th className="px-6 py-3 font-medium">Gates</th>
                  <th className="px-6 py-3 font-medium">Dataset</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {models.versions.map((version) => {
                  const isProduction =
                    version.version === models.production.artifactVersion;
                  const isRunning = version.version === models.running.version;
                  return (
                    <tr key={version.version} className="hover:bg-muted/15">
                      <td className="px-6 py-3">
                        <span className="font-mono font-semibold">
                          v{version.version}
                        </span>
                        {isProduction ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            production
                          </span>
                        ) : null}
                        {isRunning && !isProduction ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            running
                          </span>
                        ) : null}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {formatDateTime(version.createdAt)}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {version.championModel ?? "Not available"}
                      </td>
                      <td className="px-6 py-3 font-mono">
                        {formatMetric(version.metrics?.candidateTop1Accuracy, "ratio")}
                      </td>
                      <td className="px-6 py-3">
                        {version.gates.unavailable
                          ? "Not available"
                          : version.gates.promotionEligible
                            ? "Passed"
                            : "Failed"}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {version.datasetVersion ?? "Not available"}
                      </td>
                      <td className="px-6 py-3">
                        {version.trainingRunId && version.runDeployable ? (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={busy || !canWrite}
                            onClick={() =>
                              onDeployRun(
                                version.trainingRunId as string,
                                version.version,
                              )
                            }
                          >
                            Deploy
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {version.deployable
                              ? isProduction
                                ? "In production"
                                : "Not deployable from here"
                              : "Not deployable"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Deployment History"
        icon={History}
        contentClassName="p-0"
        description="Who deployed what, and what was running before it."
      >
        {models.deployments.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No deployments recorded"
              description="Deployments made from this dashboard appear here."
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Model</th>
                  <th className="px-6 py-3 font-medium">Previous</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Deployed by</th>
                  <th className="px-6 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {models.deployments.map((record: MlDeploymentRecordDto) => (
                  <tr key={record.id} className="hover:bg-muted/15">
                    <td className="px-6 py-3 font-mono font-semibold">
                      v{record.modelVersion}
                    </td>
                    <td className="px-6 py-3 font-mono text-muted-foreground">
                      {formatVersion(record.previousModelVersion)}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {record.deploymentType === "ROLLBACK" ? "Rollback" : "Candidate"}
                    </td>
                    <td className="px-6 py-3">
                      {deploymentBadge(record.status)}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {record.deployedByEmail ?? "Not recorded"}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {formatDateTime(record.deployedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Training runs
// ---------------------------------------------------------------------------

export function MlRunsPanel({
  runs,
  page,
  totalPages,
  total,
  statusFilter,
  loading,
  busy,
  canWrite,
  onStatusFilter,
  onPage,
  onViewRun,
  onDeployRun,
}: {
  runs: MlTrainingRunSummaryDto[];
  page: number;
  totalPages: number;
  total: number;
  statusFilter: TrainingRunStatus | "ALL";
  loading: boolean;
  busy: boolean;
  canWrite: boolean;
  onStatusFilter: (status: TrainingRunStatus | "ALL") => void;
  onPage: (page: number) => void;
  onViewRun: (runId: string) => void;
  onDeployRun: (runId: string, candidateVersion: string | null) => void;
}) {
  return (
    <SectionCard
      title="Training Runs"
      icon={History}
      description={`${formatCount(total)} run${total === 1 ? "" : "s"} recorded. History is paginated.`}
      actions={
        <div className="">
          <Select
            value={statusFilter}
            onValueChange={(value: string | null) =>
              onStatusFilter((value ?? "ALL") as TrainingRunStatus | "ALL")
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="PASSED">Passed gates</SelectItem>
              <SelectItem value="REJECTED">Rejected by gates</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="RUNNING">Running</SelectItem>
              <SelectItem value="QUEUED">Queued</SelectItem>
              <SelectItem value="EVALUATING">Evaluating</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
      contentClassName="p-0"
    >
      {runs.length === 0 && !loading ? (
        <div className="p-6">
          <EmptyState {...emptyStateFor("runs")} compact />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-6 py-3 font-medium">Run</th>
                <th className="px-6 py-3 font-medium">Started</th>
                <th className="px-6 py-3 font-medium">Triggered By</th>
                <th className="px-6 py-3 font-medium">Dataset</th>
                <th className="px-6 py-3 font-medium">Records</th>
                <th className="px-6 py-3 font-medium">Candidate</th>
                <th className="px-6 py-3 font-medium">Result</th>
                <th className="px-6 py-3 font-medium">Deployment</th>
                <th className="px-6 py-3 font-medium">Duration</th>
                <th className="px-6 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-muted/15">
                  <td className="px-6 py-3 font-mono text-xs">
                    <span title={run.id}>{run.id.slice(0, 8)}</span>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {formatDateTime(run.triggeredAt)}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {run.triggeredByEmail ?? "Not recorded"}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {run.datasetVersion ?? "Not available"}
                  </td>
                  <td className="px-6 py-3 font-mono text-xs">
                    {formatCount(run.trainingRecordCount)}
                    {" / "}
                    {formatCount(run.validationRecordCount)}
                  </td>
                  <td className="px-6 py-3 font-mono">
                    {formatVersion(run.candidateModelVersion)}
                  </td>
                  <td className="px-6 py-3">{runStatusBadge(run.status)}</td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {deploymentStatusLabel(run.deploymentStatus)}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {formatDuration(run.durationMs)}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onViewRun(run.id)}
                      >
                        View
                      </Button>
                      {canDeployCandidate(run) ? (
                        <Button
                          size="xs"
                          disabled={busy || !canWrite}
                          onClick={() =>
                            onDeployRun(run.id, run.candidateModelVersion)
                          }
                        >
                          Deploy
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-border px-6 py-3 text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => onPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => onPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

export function MlRunDetailPanel({
  run,
  canWrite,
  busy,
  currentRunningVersion,
  onDeploy,
}: {
  run: MlTrainingRunDetailDto;
  canWrite: boolean;
  busy: boolean;
  /** What the ML service is serving NOW, so a stored deployment is not read as present state. */
  currentRunningVersion: string | null;
  onDeploy: () => void;
}) {
  const failure = trainingErrorExplanation(
    run.failure.errorCode,
    run.failure.errorMessage,
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="Overview"
        icon={Gauge}
        actions={
          canDeployCandidate(run) ? (
            <Button size="sm" onClick={onDeploy} disabled={busy || !canWrite}>
              <Rocket data-icon="inline-start" />
              Deploy Candidate
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {deployUnavailableReason(run)}
            </span>
          )
        }
      >
        <DetailFields>
          <DetailField label="Run id">
            <DetailMono>{run.id}</DetailMono>
          </DetailField>
          <DetailField label="Status">{runStatusBadge(run.status)}</DetailField>
          <DetailField label="Triggered by">
            <DetailText>{run.triggeredByEmail ?? "Not recorded"}</DetailText>
          </DetailField>
          <DetailField label="Triggered at">
            <DetailText>{formatDateTime(run.triggeredAt)}</DetailText>
          </DetailField>
          <DetailField label="Started">
            <DetailText>{formatDateTime(run.startedAt)}</DetailText>
          </DetailField>
          <DetailField label="Completed">
            <DetailText>{formatDateTime(run.completedAt)}</DetailText>
          </DetailField>
          <DetailField label="Duration">
            <DetailText>{formatDuration(run.durationMs)}</DetailText>
          </DetailField>
          <DetailField label="Base model">
            <DetailMono className="text-sm">
              {formatVersion(run.baseModelVersion)}
            </DetailMono>
          </DetailField>
          <DetailField label="Candidate">
            <DetailMono className="text-sm">
              {formatVersion(run.candidateModelVersion)}
            </DetailMono>
          </DetailField>
        </DetailFields>
      </SectionCard>

      <SectionCard title="Dataset" icon={Database}>
        <DetailFields>
          <DetailField label="Dataset version">
            <DetailText>{run.dataset.version ?? "Not available"}</DetailText>
          </DetailField>
          <DetailField label="Snapshot fingerprint">
            <DetailMono>{formatChecksum(run.dataset.fingerprint)}</DetailMono>
          </DetailField>
          <DetailField label="Collected records">
            <DetailMono className="text-sm">
              {formatCount(run.dataset.recordCount)}
            </DetailMono>
          </DetailField>
          <DetailField label="From feedback">
            <DetailMono className="text-sm">
              {formatCount(run.dataset.feedbackRecordCount)}
            </DetailMono>
          </DetailField>
          <DetailField label="Training records">
            <DetailMono className="text-sm">
              {formatCount(run.dataset.trainingRecordCount)}
            </DetailMono>
          </DetailField>
          <DetailField label="Evaluation records">
            <DetailMono className="text-sm">
              {formatCount(run.dataset.validationRecordCount)}
            </DetailMono>
          </DetailField>
          <DetailField label="Quarantined">
            <DetailMono className="text-sm">
              {formatCount(run.dataset.quarantineRecordCount)}
            </DetailMono>
          </DetailField>
        </DetailFields>
      </SectionCard>

      <SectionCard
        title="Evaluation"
        icon={Gauge}
        description={gateSummaryNote(run.gates)}
      >
        <div className="space-y-5">
          <MetricGrid rows={evaluationMetricRows(run.evaluation)} />
          {run.gates.gates.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {run.gates.gates.map((gate) => (
                <li
                  key={gate.gate}
                  className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex items-center gap-2">
                    {gate.passed ? (
                      <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertTriangle className="size-3.5 text-destructive" />
                    )}
                    <span className="font-medium">{gateLabel(gate.gate)}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {gate.description ?? "No threshold recorded"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Artifact" icon={Boxes}>
        <DetailFields className="lg:grid-cols-2 xl:grid-cols-2">
          <DetailField label="Reference">
            <DetailMono>{run.artifact.reference ?? "Not available"}</DetailMono>
          </DetailField>
          <DetailField label="Checksum">
            <DetailMono>{formatChecksum(run.artifact.checksum)}</DetailMono>
          </DetailField>
          <DetailField label="Artifact present">
            <DetailText>{run.artifact.exists ? "Yes" : "No"}</DetailText>
          </DetailField>
          <DetailField label="Deployable">
            <DetailText>{run.artifact.deployable ? "Yes" : "No"}</DetailText>
          </DetailField>
        </DetailFields>
      </SectionCard>

      <SectionCard title="Deployment" icon={Rocket}>
        <div className="space-y-3">
          <DetailFields className="lg:grid-cols-2 xl:grid-cols-2">
            <DetailField label="State">
              {deploymentBadge(run.deployment.status)}
            </DetailField>
            <DetailField label="Model">
              <DetailMono className="text-sm">
                {formatVersion(run.deployment.modelVersion)}
              </DetailMono>
            </DetailField>
            <DetailField label="Deployed at">
              <DetailText>{formatDateTime(run.deployment.deployedAt)}</DetailText>
            </DetailField>
            <DetailField label="Deployed by">
              <DetailText>
                {run.deployment.deployedByEmail ?? "Not recorded"}
              </DetailText>
            </DetailField>
            <DetailField label="Previous production">
              <DetailMono className="text-sm">
                {formatVersion(run.deployment.previousModelVersion)}
              </DetailMono>
            </DetailField>
            <DetailField label="Running model at deployment">
              <DetailMono className="text-sm">
                {formatVersion(run.deployment.runningModelVersion)}
              </DetailMono>
            </DetailField>
            <DetailField label="Running model now">
              <DetailMono className="text-sm">
                {formatVersion(currentRunningVersion)}
              </DetailMono>
            </DetailField>
          </DetailFields>
          <p className="text-xs text-muted-foreground">
            {deploymentStatusDetail(run, currentRunningVersion)}
          </p>
        </div>
      </SectionCard>

      {failure ? (
        <SectionCard title="Failure" icon={AlertTriangle}>
          <div className="space-y-3">
            <DetailFields className="lg:grid-cols-2 xl:grid-cols-2">
              <DetailField label="Error code">
                <DetailMono>{run.failure.errorCode ?? "Not available"}</DetailMono>
              </DetailField>
            </DetailFields>
            <p className="text-sm">{failure}</p>
            {run.failure.logExcerpt ? (
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
                {run.failure.logExcerpt}
              </pre>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export function MlDatasetsPanel({ dataset }: { dataset: MlDatasetDto }) {
  const unavailable = datasetUnavailableReason(dataset);
  const qualityRows = datasetQualityRows(dataset);

  return (
    <div className="space-y-6">
      {unavailable ? (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {unavailable}
        </p>
      ) : null}

      <SectionCard
        title="Current Dataset"
        icon={Database}
        description={datasetFreshnessNote(dataset)}
      >
        {dataset.current ? (
          <DetailFields>
            <DetailField label="Version">
              <DetailMono className="text-sm">{dataset.current.version}</DetailMono>
            </DetailField>
            <DetailField label="Generated">
              <DetailText>{formatDateTime(dataset.current.generatedAt)}</DetailText>
            </DetailField>
            <DetailField label="Total records">
              <DetailMono className="text-sm">
                {formatCount(dataset.current.totalRecords)}
              </DetailMono>
            </DetailField>
            <DetailField label="Validated">
              <DetailMono className="text-sm">
                {formatCount(dataset.current.validatedRecords)}
              </DetailMono>
            </DetailField>
            <DetailField label="Quarantined">
              <DetailMono className="text-sm">
                {formatCount(dataset.current.quarantinedRecords)}
              </DetailMono>
            </DetailField>
            <DetailField label="Training records">
              <DetailMono className="text-sm">
                {formatCount(dataset.current.trainingRecords)}
              </DetailMono>
            </DetailField>
            <DetailField label="Evaluation records">
              <DetailMono className="text-sm">
                {formatCount(dataset.current.evaluationRecords)}
              </DetailMono>
            </DetailField>
            <DetailField label="Expanded examples">
              <DetailMono className="text-sm">
                {formatCount(dataset.current.expandedExamples)}
              </DetailMono>
            </DetailField>
            <DetailField label="Snapshot fingerprint">
              <DetailMono>{formatChecksum(dataset.current.fingerprint)}</DetailMono>
            </DetailField>
            <DetailField label="Zero-leakage verified">
              <DetailText>
                {dataset.current.dataLeakageVerified === null
                  ? "Not available"
                  : dataset.current.dataLeakageVerified
                    ? "Yes"
                    : "No"}
              </DetailText>
            </DetailField>
          </DetailFields>
        ) : (
          <EmptyState {...emptyStateFor("datasets")} compact />
        )}
      </SectionCard>

      <SectionCard
        title="Quality"
        icon={CheckCircle2}
        description="Only measures the training pipeline actually produces are shown."
      >
        <DetailFields className="lg:grid-cols-3 xl:grid-cols-6">
          {qualityRows.map((row) => (
            <DetailField key={row.label} label={row.label}>
              {row.available ? (
                <DetailMono className="text-sm">{row.value}</DetailMono>
              ) : (
                <span className="text-sm text-muted-foreground italic">
                  {row.value}
                </span>
              )}
            </DetailField>
          ))}
        </DetailFields>
        {dataset.quality.quarantineByReason.length > 0 ? (
          <div className="mt-5 space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              Quarantine reasons
            </h4>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {dataset.quality.quarantineByReason.map((reason) => (
                <li
                  key={reason.reason}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs">{reason.reason}</span>
                  <span className="font-mono text-xs">{reason.count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DistributionList
          title="Category distribution"
          entries={dataset.quality.categoryDistribution}
        />
        <DistributionList
          title="Manufacturer distribution"
          entries={dataset.quality.manufacturerDistribution}
        />
      </div>

      <SectionCard
        title="Snapshot History"
        icon={History}
        contentClassName="p-0"
        description="Each snapshot is immutable and identified by its own fingerprint."
      >
        {dataset.history.length === 0 ? (
          <div className="p-6">
            <EmptyState {...emptyStateFor("datasets")} compact />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Version</th>
                  <th className="px-6 py-3 font-medium">Generated</th>
                  <th className="px-6 py-3 font-medium">Records</th>
                  <th className="px-6 py-3 font-medium">Training</th>
                  <th className="px-6 py-3 font-medium">Evaluation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dataset.history.map((snapshot) => (
                  <tr key={snapshot.version} className="hover:bg-muted/15">
                    <td className="px-6 py-3 font-mono text-xs">{snapshot.version}</td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {formatDateTime(snapshot.generatedAt)}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs">
                      {formatCount(snapshot.totalRecords)}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs">
                      {formatCount(snapshot.trainingRecords)}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs">
                      {formatCount(snapshot.evaluationRecords)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function DistributionList({
  title,
  entries,
}: {
  title: string;
  entries: Array<{ name: string; count: number }>;
}) {
  return (
    <SectionCard title={title} icon={Layers}>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not available</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.map((entry) => (
            <li
              key={entry.name}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="truncate" title={entry.name}>
                {entry.name}
              </span>
              <span className="ml-3 font-mono text-xs">{entry.count}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export function MlUsagePanel({ usage }: { usage: MlUsageDto }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {usageHeadlineCounts(usage).map((count) => (
          <StatCard key={count.label} title={count.label} value={count.value} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Feedback"
          icon={Sparkles}
          description="Decisions recorded on AI suggestions — the labelled data behind retraining."
        >
          <DetailFields className="lg:grid-cols-3 xl:grid-cols-3">
            <DetailField label="Total">
              <DetailMono className="text-sm">
                {formatCount(usage.feedback.total)}
              </DetailMono>
            </DetailField>
            <DetailField label="Accepted">
              <DetailMono className="text-sm">
                {formatCount(usage.feedback.accepted)}
              </DetailMono>
            </DetailField>
            <DetailField label="Rejected">
              <DetailMono className="text-sm">
                {formatCount(usage.feedback.rejected)}
              </DetailMono>
            </DetailField>
            <DetailField label="Edited">
              <DetailMono className="text-sm">
                {formatCount(usage.feedback.edited)}
              </DetailMono>
            </DetailField>
            <DetailField label="Since last training">
              <DetailMono className="text-sm">
                {formatCount(usage.feedback.sinceLastTraining)}
              </DetailMono>
            </DetailField>
            <DetailField label="Used in last training">
              <DetailMono className="text-sm">
                {formatCount(usage.feedback.usedInLastTraining)}
              </DetailMono>
            </DetailField>
          </DetailFields>
        </SectionCard>

        <SectionCard
          title="Intelligence Findings"
          icon={Gauge}
          description="Review-queue items across the component and attribute queues."
        >
          <DetailFields className="lg:grid-cols-3 xl:grid-cols-3">
            <DetailField label="Total">
              <DetailMono className="text-sm">
                {formatCount(usage.findings.total)}
              </DetailMono>
            </DetailField>
            <DetailField label="Pending">
              <DetailMono className="text-sm">
                {formatCount(usage.findings.pending)}
              </DetailMono>
            </DetailField>
            <DetailField label="Accepted">
              <DetailMono className="text-sm">
                {formatCount(usage.findings.accepted)}
              </DetailMono>
            </DetailField>
            <DetailField label="Rejected">
              <DetailMono className="text-sm">
                {formatCount(usage.findings.rejected)}
              </DetailMono>
            </DetailField>
            <DetailField label="Dismissed">
              <DetailMono className="text-sm">
                {formatCount(usage.findings.dismissed)}
              </DetailMono>
            </DetailField>
            <DetailField label="Stale">
              <DetailMono className="text-sm">
                {formatCount(usage.findings.stale)}
              </DetailMono>
            </DetailField>
            <DetailField label="Applied">
              <DetailMono className="text-sm">
                {formatCount(usage.findings.applied)}
              </DetailMono>
            </DetailField>
          </DetailFields>
        </SectionCard>
      </div>

      <SectionCard
        title="Training"
        icon={History}
        description="Operator-triggered runs and the deployments they produced."
      >
        <DetailFields className="lg:grid-cols-3 xl:grid-cols-6">
          <DetailField label="Total runs">
            <DetailMono className="text-sm">
              {formatCount(usage.training.totalRuns)}
            </DetailMono>
          </DetailField>
          <DetailField label="Passed">
            <DetailMono className="text-sm">
              {formatCount(usage.training.passed)}
            </DetailMono>
          </DetailField>
          <DetailField label="Rejected">
            <DetailMono className="text-sm">
              {formatCount(usage.training.rejected)}
            </DetailMono>
          </DetailField>
          <DetailField label="Failed">
            <DetailMono className="text-sm">
              {formatCount(usage.training.failed)}
            </DetailMono>
          </DetailField>
          <DetailField label="Deployments">
            <DetailMono className="text-sm">
              {formatCount(usage.training.deployments)}
            </DetailMono>
          </DetailField>
          <DetailField label="Rollbacks">
            <DetailMono className="text-sm">
              {formatCount(usage.training.rollbacks)}
            </DetailMono>
          </DetailField>
        </DetailFields>
      </SectionCard>

      {usage.feedback.bySuggestionType.length > 0 ? (
        <DistributionList
          title="Feedback by intelligence type"
          entries={usage.feedback.bySuggestionType.map((entry) => ({
            name: entry.suggestionType,
            count: entry.count,
          }))}
        />
      ) : null}

      {usage.findings.byIssueCategory.length > 0 ? (
        <DistributionList
          title="Findings by issue category"
          entries={usage.findings.byIssueCategory.map((entry) => ({
            name: entry.issueCategory,
            count: entry.count,
          }))}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmations
// ---------------------------------------------------------------------------

/**
 * The three confirmations this dashboard requires.
 *
 * Each names exactly what will change. There is no "are you sure?" without a
 * subject: retraining states that it does not deploy, deploying names both versions,
 * and rolling back names what is being restored.
 */
export function MlOpsConfirmations({
  retrain,
  deploy,
  rollback,
  busy,
  onConfirmRetrain,
  onConfirmDeploy,
  onConfirmRollback,
  onCancel,
}: {
  /**
   * The retrain facts the operator is confirming, or null when no dialog is open.
   *
   * Built by `retrainConfirmation` so the dialog names the current model, the
   * dataset, the eligible record count and the last training date — and states that
   * training does not deploy.
   */
  retrain: {
    currentModelVersion: string | null | undefined;
    datasetVersion: string | null | undefined;
    feedbackRecordCount: number | null | undefined;
    lastTrainedAt: string | null | undefined;
  } | null;
  deploy: { currentVersion: string | null; candidateVersion: string | null } | null;
  rollback: string | null;
  busy: boolean;
  onConfirmRetrain: () => void;
  onConfirmDeploy: () => void;
  onConfirmRollback: () => void;
  onCancel: () => void;
}) {
  const deployCopy = deploy
    ? deployConfirmation(deploy.currentVersion, deploy.candidateVersion)
    : null;
  const rollbackCopy = rollback !== null ? rollbackConfirmation(rollback) : null;
  const retrainCopy = retrain ? retrainConfirmation(retrain) : null;

  return (
    <>
      <ConfirmDialog
        isOpen={retrainCopy !== null}
        title={retrainCopy?.title ?? ""}
        description={(retrainCopy?.description ?? "").split("\n").filter(Boolean).join("  ·  ")}
        confirmText={retrainCopy?.confirmText ?? "Start training"}
        variant="default"
        loading={busy}
        onConfirm={onConfirmRetrain}
        onCancel={onCancel}
      />
      <ConfirmDialog
        isOpen={deployCopy !== null}
        title={deployCopy?.title ?? ""}
        description={deployCopy?.description ?? ""}
        confirmText={deployCopy?.confirmText ?? "Deploy"}
        variant="default"
        loading={busy}
        onConfirm={onConfirmDeploy}
        onCancel={onCancel}
      />
      <ConfirmDialog
        isOpen={rollbackCopy !== null}
        title={rollbackCopy?.title ?? ""}
        description={rollbackCopy?.description ?? ""}
        confirmText={rollbackCopy?.confirmText ?? "Roll back"}
        variant="default"
        loading={busy}
        onConfirm={onConfirmRollback}
        onCancel={onCancel}
      />
    </>
  );
}

