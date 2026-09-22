import type {
  DeploymentStatus,
  MlDatasetDto,
  MlEvaluationMetricsDto,
  MlGateResultDto,
  MlGateSummaryDto,
  MlHealthDto,
  MlModelsDto,
  MlTrainingRunDetailDto,
  MlTrainingRunSummaryDto,
  MlUsageDto,
  TrainingPhase,
  TrainingRunStatus,
} from "./api/ml-ops-api";

/**
 * ML & Intelligence — presentation logic.
 *
 * Kept free of React and of `fetch` so it can be unit-tested directly, matching the
 * convention used by the component and attribute review queues. Everything here is
 * a pure function of data the server sent: there is no progress estimation, no
 * synthesised metric and no default that could be mistaken for a measurement.
 */

/** The permission the control plane requires. Mirrors `MlAdminGuard`. */
export const ML_OPS_PERMISSION = "Administration.Roles";

/** Poll interval while a run is active. Polling stops as soon as it is terminal. */
export const ML_OPS_POLL_INTERVAL_MS = 4000;

/** Page size for the training history table. */
export const ML_OPS_HISTORY_PAGE_SIZE = 20;

export type MlTabId = "overview" | "models" | "runs" | "datasets" | "usage";

export interface MlTabDefinition {
  id: MlTabId;
  label: string;
}

export const ML_OPS_TABS: readonly MlTabDefinition[] = [
  { id: "overview", label: "Overview" },
  { id: "models", label: "Models" },
  { id: "runs", label: "Training Runs" },
  { id: "datasets", label: "Datasets" },
  { id: "usage", label: "Usage" },
] as const;

/**
 * The sentence every operator needs before pressing Retrain.
 *
 * It states what training does and does not do, because the single most dangerous
 * misunderstanding in this area is that a successful run replaces the model.
 */
export const TRAINING_SCOPE_NOTICE =
  "Training creates a candidate model. It does not automatically replace the production model.";

/** What a status means, in the operator's terms. */
const STATUS_LABELS: Record<TrainingRunStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  EVALUATING: "Evaluating",
  PASSED: "Passed gates",
  REJECTED: "Rejected by gates",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function trainingStatusLabel(status: TrainingRunStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Real pipeline phases, named as the pipeline names them. */
const PHASE_LABELS: Record<TrainingPhase, string> = {
  PREPARING_DATASET: "Preparing dataset",
  TRAINING: "Training",
  EVALUATING: "Evaluating",
  PACKAGING: "Packaging candidate",
  COMPLETED: "Completed",
};

export function trainingPhaseLabel(phase: TrainingPhase | null): string | null {
  if (!phase) return null;
  return PHASE_LABELS[phase] ?? null;
}

/**
 * The ordered phases, used to render a step indicator.
 *
 * The indicator shows which phases have happened, never a percentage: the pipeline
 * reports step boundaries, not fractions of work, and inventing a percentage would
 * be a fabricated measurement.
 */
export const TRAINING_PHASE_SEQUENCE: readonly TrainingPhase[] = [
  "PREPARING_DATASET",
  "TRAINING",
  "EVALUATING",
  "PACKAGING",
] as const;

export function phaseStepState(
  current: TrainingPhase | null,
  step: TrainingPhase,
): "done" | "current" | "pending" {
  if (!current) return "pending";
  if (current === "COMPLETED") return "done";
  const currentIndex = TRAINING_PHASE_SEQUENCE.indexOf(current);
  const stepIndex = TRAINING_PHASE_SEQUENCE.indexOf(step);
  if (currentIndex < 0 || stepIndex < 0) return "pending";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "current";
  return "pending";
}

export function isActiveRunStatus(status: TrainingRunStatus): boolean {
  return status === "QUEUED" || status === "RUNNING" || status === "EVALUATING";
}

/**
 * Whether the page should keep polling.
 *
 * True only while a run is active. A terminal run (passed, rejected, failed,
 * cancelled) stops the timer, so the dashboard does not poll forever.
 */
export function shouldPoll(
  run: MlTrainingRunSummaryDto | null | undefined,
): boolean {
  if (!run) return false;
  return isActiveRunStatus(run.status);
}

const DEPLOYMENT_LABELS: Record<DeploymentStatus, string> = {
  NOT_DEPLOYED: "Not deployed",
  DEPLOYED: "Deployed",
  DEPLOYED_PENDING_RELOAD: "Deployed — reload pending",
  DEPLOYMENT_FAILED: "Deployment failed",
};

export function deploymentStatusLabel(status: DeploymentStatus): string {
  return DEPLOYMENT_LABELS[status] ?? status;
}

/**
 * The honest one-line summary of the deployment state.
 *
 * `DEPLOYED_PENDING_RELOAD` is the case that must never read as plain success: the
 * artifact is in place but the running process is still serving the previous model.
 */
export function deploymentStatusDetail(
  run: Pick<MlTrainingRunDetailDto, "deployment">,
  currentRunningVersion?: string | null,
): string {
  const { status, runningModelVersion, reloadError } = run.deployment;
  if (status === "DEPLOYED") {
    const base = runningModelVersion
      ? `The running model became v${runningModelVersion} when this deployment completed.`
      : "The artifact was deployed and the running model was reloaded.";
    // The recorded version is a historical fact. Production may have moved since
    // (a later deployment or a rollback), and saying "the running model IS vX" from a
    // stored row would misreport the present state.
    if (currentRunningVersion && currentRunningVersion !== runningModelVersion) {
      return `${base} Production has since moved: the ML service is now serving v${currentRunningVersion}.`;
    }
    return base;
  }
  if (status === "DEPLOYED_PENDING_RELOAD") {
    return `The artifact was deployed, but the ML service is still serving ${
      runningModelVersion ? `v${runningModelVersion}` : "the previous model"
    }.${reloadError ? ` Reload reported: ${reloadError}` : ""}`;
  }
  if (status === "DEPLOYMENT_FAILED") {
    return "The deployment did not complete. The production model is unchanged.";
  }
  return "This candidate has not been deployed.";
}

/** Failure codes → what the operator should understand from them. */
const ERROR_MESSAGES: Record<string, string> = {
  DATASET_BUILD_FAILED:
    "The dataset could not be built. The production model was not changed.",
  TRAINING_FAILED:
    "Training did not complete. The production model was not changed.",
  EVALUATION_FAILED:
    "Evaluation did not complete, so no gate verdict exists. The production model was not changed.",
  PACKAGING_FAILED:
    "The candidate could not be packaged. The production model was not changed.",
  INTERNAL_ERROR: "The training runner failed unexpectedly.",
  ML_UNAVAILABLE: "The ML service could not be reached.",
  ML_DISABLED: "The ML service is disabled in this deployment.",
  ML_BUSY: "The ML service was already running a training job.",
  ML_JOB_LOST:
    "The ML service no longer reports this run — it was most likely restarted while training. The production model was not changed.",
  DISPATCH_FAILED: "The training job could not be started.",
};

export function trainingErrorExplanation(
  errorCode: string | null,
  errorMessage: string | null,
): string | null {
  if (!errorCode && !errorMessage) return null;
  const known = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  if (known && errorMessage) return `${known} (${errorMessage})`;
  if (known) return known;
  return errorMessage;
}

// ------------------------------------------------------------------ formatting

/**
 * Formats a metric the pipeline produced.
 *
 * `null`/`undefined` renders as "Not available" — never as zero, which would read
 * as a measured result. Ratios are rendered as percentages because that is how the
 * evaluator prints them.
 */
export function formatMetric(
  value: number | undefined | null,
  kind: "ratio" | "number" | "milliseconds" | "megabytes" | "bytes" = "number",
): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "Not available";
  }
  switch (kind) {
    case "ratio":
      return `${(value * 100).toFixed(1)}%`;
    case "milliseconds":
      return `${value.toFixed(2)} ms`;
    case "megabytes":
      return `${value.toFixed(1)} MB`;
    case "bytes":
      return `${(value / 1024).toFixed(1)} KB`;
    default:
      return String(value);
  }
}

/** Formats a count, or "Not available" when the pipeline reported none. */
export function formatCount(value: number | undefined | null): string {
  if (value === undefined || value === null) return "Not available";
  return value.toLocaleString();
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";
  return parsed.toLocaleString();
}

export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return "Not available";
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}

export function formatAgeHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "Not available";
  if (hours < 1) return "less than an hour ago";
  if (hours < 48) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Short checksum display: enough to compare two, short enough for a table cell. */
export function formatChecksum(checksum: string | null | undefined): string {
  if (!checksum) return "Not available";
  return checksum.slice(0, 12);
}

export function formatVersion(version: string | null | undefined): string {
  return version ? `v${version}` : "Not available";
}

// ----------------------------------------------------------------------- health

export type HealthTone = "healthy" | "degraded" | "unavailable";

export function healthTone(health: MlHealthDto | null | undefined): HealthTone {
  if (!health || !health.serviceReachable) return "unavailable";
  if (!health.ready) return "degraded";
  return "healthy";
}

export function healthLabel(tone: HealthTone): string {
  if (tone === "healthy") return "Healthy";
  if (tone === "degraded") return "Degraded";
  return "Unavailable";
}

export function healthExplanation(health: MlHealthDto | null | undefined): string {
  if (!health) return "ML status has not been loaded yet.";
  if (!health.serviceReachable) {
    return health.serviceEnabled
      ? "The ML service did not answer. Training and deployment are unavailable until it does."
      : "The ML service is disabled in this deployment, so training and deployment are unavailable.";
  }
  if (!health.ready) {
    return "The ML service answered but not every model it loads at startup is loaded.";
  }
  return "The ML service answered and reports every model loaded.";
}

// ----------------------------------------------------------------------- models

/**
 * Whether the running model matches the deployed artifact.
 *
 * The single most misleading thing this dashboard could say is "production model
 * updated" when the running process still holds the old one, so the two are always
 * reported side by side.
 */
export function runningModelMatchesArtifact(
  models: MlModelsDto | null | undefined,
): boolean | null {
  if (!models || !models.available) return null;
  if (!models.running.loaded) return false;
  if (!models.production.checksum || !models.running.checksum) return null;
  return models.production.checksum === models.running.checksum;
}

export function canRollback(models: MlModelsDto | null | undefined): boolean {
  return Boolean(models?.available && models.production.rollbackAvailable);
}

export function rollbackUnavailableReason(
  models: MlModelsDto | null | undefined,
): string | null {
  if (!models || !models.available) {
    return "The ML service is unavailable, so rollback cannot be performed.";
  }
  if (!models.production.rollbackAvailable) {
    return "No previous production artifact is available to roll back to.";
  }
  return null;
}

// ------------------------------------------------------------------ deployment

/**
 * Whether a candidate may be deployed, and why not when it may not.
 *
 * Mirrors the server's rules; the server remains the authority and re-checks every
 * one of them. This exists so the button is not offered when it cannot work.
 */
export function canDeployCandidate(
  run: MlTrainingRunSummaryDto | null | undefined,
): boolean {
  if (!run) return false;
  if (isActiveRunStatus(run.status)) return false;
  if (run.status !== "PASSED") return false;
  if (run.promotionEligible !== true) return false;
  return run.deploymentStatus === "NOT_DEPLOYED";
}

export function deployUnavailableReason(
  run: MlTrainingRunSummaryDto | null | undefined,
): string | null {
  if (!run) return "There is no candidate to deploy.";
  if (isActiveRunStatus(run.status)) return "Training is still running.";
  if (run.status === "REJECTED") {
    return "This candidate did not pass every quality gate, so it cannot be deployed.";
  }
  if (run.status === "FAILED") {
    return "This run failed, so it produced no deployable candidate.";
  }
  if (run.status !== "PASSED") return "This run has not produced a candidate.";
  if (run.promotionEligible !== true) {
    return "No passing gate record exists for this candidate.";
  }
  if (run.deploymentStatus !== "NOT_DEPLOYED") {
    return "This candidate has already been deployed.";
  }
  return null;
}

/**
 * The confirmation shown before a candidate replaces production.
 *
 * Names both versions explicitly: the operator is approving a specific replacement,
 * not "the latest model".
 */
export function deployConfirmation(
  currentVersion: string | null | undefined,
  candidateVersion: string | null | undefined,
): { title: string; description: string; confirmText: string } {
  const candidate = formatVersion(candidateVersion);
  const current = formatVersion(currentVersion);
  return {
    title: `Deploy ${candidate}?`,
    description: `Current: ${current}. Candidate: ${candidate}. Deploying will make ${candidate} the production model. This changes the intelligence used across Ananya.`,
    confirmText: `Deploy ${candidate}`,
  };
}

export function rollbackConfirmation(
  currentVersion: string | null | undefined,
): { title: string; description: string; confirmText: string } {
  return {
    title: "Roll back the production model?",
    description: `The current production model (${formatVersion(
      currentVersion,
    )}) will be replaced by the previous artifact the deployment tool kept. The deployment is recorded in the history.`,
    confirmText: "Roll back",
  };
}

/**
 * The confirmation shown before training starts.
 *
 * Repeats the dataset and eligibility facts the operator needs, and states that
 * training does not deploy.
 */
export function retrainConfirmation(input: {
  currentModelVersion: string | null | undefined;
  datasetVersion: string | null | undefined;
  feedbackRecordCount: number | null | undefined;
  lastTrainedAt: string | null | undefined;
}): { title: string; description: string; confirmText: string } {
  const lines = [
    `Current production model: ${formatVersion(input.currentModelVersion)}`,
    `Dataset: ${input.datasetVersion ?? "Not available"}`,
    // Deliberately NOT "eligible records": the pipeline's collector does not ingest
    // the feedback ledger today, so nothing in the system can say which feedback
    // records training would consume. The count that exists is how much feedback is
    // on file, and that is what is reported.
    `Feedback records on file: ${formatCount(input.feedbackRecordCount)}`,
    `Last trained: ${formatDateTime(input.lastTrainedAt)}`,
  ];
  return {
    title: "Retrain the category model?",
    description: `${lines.join("\n")}\n\n${TRAINING_SCOPE_NOTICE}`,
    confirmText: "Start training",
  };
}

/** Why retraining cannot be started right now, or null when it can. */
export function retrainUnavailableReason(input: {
  health: MlHealthDto | null | undefined;
  activeRunId: string | null | undefined;
  canWrite: boolean;
}): string | null {
  if (!input.canWrite) {
    return `You do not have permission to manage model training (requires ${ML_OPS_PERMISSION}).`;
  }
  if (input.activeRunId) {
    return "A training run is already active. Wait for it to finish.";
  }
  if (!input.health || !input.health.serviceReachable) {
    return "The ML service is unavailable, so training cannot be started.";
  }
  return null;
}

// ---------------------------------------------------------------------- gates

export function gateLabel(gate: string): string {
  return gate
    .replace(/_gate$/, "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Whether the gate verdicts are worth rendering.
 *
 * A run that never reached evaluation has no gates, and the UI must say so rather
 * than showing an empty table that looks like a pass.
 */
export function gateSummaryNote(gates: MlGateSummaryDto): string {
  if (gates.unavailable) return "No gate results were recorded for this run.";
  const failed = gates.gates.filter((gate) => !gate.passed).length;
  if (failed === 0) return "Every mandatory quality gate passed.";
  return `${failed} of ${gates.gates.length} gates did not pass, so this candidate cannot be deployed.`;
}

export function gateTone(gate: MlGateResultDto): "pass" | "fail" {
  return gate.passed ? "pass" : "fail";
}

// ------------------------------------------------------------------- datasets

/** Which dataset facts exist, so the panel can say "Not available" honestly. */
export function datasetQualityRows(
  dataset: MlDatasetDto,
): Array<{ label: string; value: string; available: boolean }> {
  const quality = dataset.quality;
  return [
    {
      label: "Duplicate pairs",
      value: formatCount(quality.duplicatePairs),
      available: quality.duplicatePairs !== null,
    },
    {
      label: "Conflicting labels",
      value: formatCount(quality.conflictingLabels),
      available: quality.conflictingLabels !== null,
    },
    {
      label: "Missing required fields",
      value: formatCount(quality.missingFields),
      available: quality.missingFields !== null,
    },
    {
      label: "Quarantined records",
      value: formatCount(quality.quarantineTotal),
      available: quality.quarantineTotal !== null,
    },
    {
      label: "Distinct MPN families",
      value: formatCount(quality.distinctBaseFamilies),
      available: quality.distinctBaseFamilies !== null,
    },
    {
      label: "Validated records",
      value: formatCount(quality.validatedRecordCount),
      available: quality.validatedRecordCount !== null,
    },
  ];
}

export function datasetUnavailableReason(dataset: MlDatasetDto): string | null {
  if (dataset.available) return null;
  return "The ML service is unavailable, so the dataset snapshot cannot be read.";
}

export function datasetFreshnessNote(dataset: MlDatasetDto): string {
  if (!dataset.current) {
    return "No dataset snapshot has been built yet. Training builds one.";
  }
  const age = formatAgeHours(dataset.freshness.ageHours);
  const since =
    dataset.freshness.recordsSinceLastTraining === null
      ? "Feedback since the last training run is not available."
      : `${formatCount(dataset.freshness.recordsSinceLastTraining)} feedback records since the last training run.`;
  return `Snapshot built ${age}. ${since}`;
}

// ----------------------------------------------------------------------- usage

export function usageUnavailableNote(usage: MlUsageDto | null | undefined): string | null {
  if (!usage) return "Usage statistics have not been loaded.";
  if (!usage.available.feedback && !usage.available.findings && !usage.available.training) {
    return "No usage data is available.";
  }
  return null;
}

/**
 * The headline counts, labelled so a zero is unambiguous.
 *
 * A zero here is a real measurement (nothing has been recorded), unlike a metric the
 * pipeline never produced — which is rendered "Not available" instead.
 */
export function usageHeadlineCounts(usage: MlUsageDto): Array<{
  label: string;
  value: string;
}> {
  return [
    { label: "Feedback", value: formatCount(usage.feedback.total) },
    { label: "Findings", value: formatCount(usage.findings.total) },
    { label: "Training runs", value: formatCount(usage.training.totalRuns) },
    { label: "Deployed models", value: formatCount(usage.training.deployments) },
  ];
}

/** The evaluation metrics the pipeline actually produced, in display order. */
export function evaluationMetricRows(
  metrics: MlEvaluationMetricsDto | null | undefined,
): Array<{ label: string; value: string }> {
  if (!metrics) return [];
  return [
    {
      label: "Top-1 accuracy",
      value: formatMetric(metrics.candidateTop1Accuracy, "ratio"),
    },
    {
      label: "Top-3 accuracy",
      value: formatMetric(metrics.candidateTop3Accuracy, "ratio"),
    },
    {
      label: "Active model top-1",
      value: formatMetric(metrics.activeModelTop1Accuracy, "ratio"),
    },
    {
      label: "Manufacturer accuracy",
      value: formatMetric(metrics.manufacturerAccuracy, "ratio"),
    },
    {
      label: "Duplicate precision",
      value: formatMetric(metrics.duplicatePrecision, "ratio"),
    },
    {
      label: "Duplicate recall",
      value: formatMetric(metrics.duplicateRecall, "ratio"),
    },
    {
      label: "Critical false merges",
      value: formatMetric(metrics.criticalFalsePositives),
    },
    {
      label: "Latency p95",
      value: formatMetric(metrics.latencyMs?.p95, "milliseconds"),
    },
    {
      label: "Peak memory",
      value: formatMetric(metrics.peakMemoryMb, "megabytes"),
    },
    {
      label: "Artifact size",
      value: formatMetric(metrics.modelSizeBytes, "bytes"),
    },
  ];
}

/**
 * Where a number came from, so the three model states are never conflated.
 *
 * The dashboard distinguishes the CURRENT PRODUCTION MODEL, the LAST TRAINING RUN
 * and the CANDIDATE, and this is the label each block uses.
 */
export function metricScopeLabel(
  scope: "PRODUCTION" | "LAST_RUN" | "CANDIDATE",
): string {
  if (scope === "PRODUCTION") return "Current production model";
  if (scope === "LAST_RUN") return "Last training run";
  return "Candidate model";
}

/** The empty-state copy for each tab, so no panel invents a placeholder number. */
export function emptyStateFor(tab: MlTabId): { title: string; description: string } {
  switch (tab) {
    case "models":
      return {
        title: "No model versions found",
        description:
          "The registry has no candidates yet. Training a model creates the first one.",
      };
    case "runs":
      return {
        title: "No training runs yet",
        description:
          "Training is operator-triggered. Start one from the Overview tab when you are ready.",
      };
    case "datasets":
      return {
        title: "No dataset snapshot yet",
        description:
          "A snapshot is built at the start of every training run. Nothing is built on a schedule.",
      };
    case "usage":
      return {
        title: "No usage recorded yet",
        description:
          "Feedback and findings appear here once the intelligence features are used.",
      };
    default:
      return {
        title: "ML status unavailable",
        description:
          "The ML service did not answer. Check that it is running and reachable.",
      };
  }
}
