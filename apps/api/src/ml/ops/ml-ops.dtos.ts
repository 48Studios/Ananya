import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * ML Operations contracts.
 *
 * Naming and validation follow the existing review-queue DTOs: query DTOs are
 * classes with `class-transformer` coercion, responses are interfaces (the read
 * model is not an entity and needs no decorators), and every enum is a
 * `as const` tuple so a controller can validate against it.
 */

/**
 * Training-run lifecycle.
 *
 * `QUEUED` → `RUNNING` → `EVALUATING` → `PASSED` | `REJECTED`, with `FAILED` as the
 * failure exit from any active state and `CANCELLED` reserved for a run that never
 * started. The API never reports `PASSED` for a run whose gates failed, and never
 * reports `DEPLOYED` for a candidate that was not explicitly promoted.
 */
export const TRAINING_RUN_STATUSES = [
  'QUEUED',
  'RUNNING',
  'EVALUATING',
  'PASSED',
  'REJECTED',
  'FAILED',
  'CANCELLED',
] as const;
export type TrainingRunStatus = (typeof TRAINING_RUN_STATUSES)[number];

/** Statuses in which the ML service may still be working. */
export const ACTIVE_TRAINING_RUN_STATUSES: readonly TrainingRunStatus[] = [
  'QUEUED',
  'RUNNING',
  'EVALUATING',
];

export function isActiveTrainingRunStatus(status: string): boolean {
  return ACTIVE_TRAINING_RUN_STATUSES.includes(status as TrainingRunStatus);
}

/** Real pipeline phases. There is no percentage anywhere in this contract. */
export const TRAINING_PHASES = [
  'PREPARING_DATASET',
  'TRAINING',
  'EVALUATING',
  'PACKAGING',
  'COMPLETED',
] as const;
export type TrainingPhase = (typeof TRAINING_PHASES)[number];

export const DEPLOYMENT_STATUSES = [
  'NOT_DEPLOYED',
  'DEPLOYED',
  'DEPLOYED_PENDING_RELOAD',
  'DEPLOYMENT_FAILED',
] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const DEPLOYMENT_TYPES = ['CANDIDATE', 'ROLLBACK'] as const;
export type DeploymentType = (typeof DEPLOYMENT_TYPES)[number];

/**
 * Stable error codes.
 *
 * The API stores the ML runner's own codes verbatim and adds the ones only the API
 * can observe (it is the API that dispatches and polls). The dashboard switches on
 * these, so a message can be reworded freely.
 */
export const TRAINING_ERROR_CODES = [
  // Emitted by the ML runner.
  'DATASET_BUILD_FAILED',
  'TRAINING_FAILED',
  'EVALUATION_FAILED',
  'PACKAGING_FAILED',
  'INTERNAL_ERROR',
  // Observed by the API.
  'ML_UNAVAILABLE',
  'ML_DISABLED',
  'ML_BUSY',
  'ML_JOB_LOST',
  'DISPATCH_FAILED',
] as const;
export type TrainingErrorCode = (typeof TRAINING_ERROR_CODES)[number];

/** Reasons an ML operation was refused. Mirrors the ML service's codes. */
export const ML_OPS_REFUSAL_REASONS = [
  'TRAINING_ALREADY_ACTIVE',
  'CANDIDATE_NOT_READY',
  'RUN_NOT_FINISHED',
  'CANDIDATE_NOT_ELIGIBLE',
  'ARTIFACT_MISSING',
  'NO_ROLLBACK_ARTIFACT',
  'ROLLBACK_FAILED',
  'DEPLOYMENT_FAILED',
  'ML_UNAVAILABLE',
  'ML_DISABLED',
  'CONCURRENT_DEPLOYMENT',
] as const;
export type MlOpsRefusalReason = (typeof ML_OPS_REFUSAL_REASONS)[number];

export const MAX_TRAINING_RUN_PAGE_SIZE = 100;
export const DEFAULT_TRAINING_RUN_PAGE_SIZE = 20;

export class ListTrainingRunsQueryDto {
  @IsOptional()
  @IsIn([...TRAINING_RUN_STATUSES])
  status?: TrainingRunStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  candidateModelVersion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TRAINING_RUN_PAGE_SIZE)
  pageSize?: number;
}

/**
 * Trigger request.
 *
 * Empty by design. There is no version, dataset, path, argument list or
 * hyperparameter to supply: the pipeline allocates its own version, builds its own
 * dataset and evaluates against its own gates. An empty DTO is also what makes the
 * global `forbidNonWhitelisted` pipe reject a stray field — a route with no
 * `@Body()` at all would accept one silently.
 */
export class TriggerTrainingRunDto {}

/** Promote request. The candidate is identified by the run that produced it. */
export class DeployCandidateDto {
  /**
   * Revision gate.
   *
   * The dashboard sends the candidate version it displayed in the confirmation, so
   * an operator cannot promote a different candidate than the one they approved.
   * Optional because the value is advisory to the caller, not to the server: the
   * server's own gate check is what decides whether promotion is allowed.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  expectedCandidateVersion?: string;
}

export interface MlHealthDto {
  /** The API could reach the ML service and it answered `/ready`. */
  serviceReachable: boolean;
  /** ML is switched on in this deployment (`ML_SERVICE_ENABLED`). */
  serviceEnabled: boolean;
  /** All models the service loads at startup are loaded. */
  ready: boolean;
  modelsLoaded: Record<string, boolean>;
  categoryModelLoaded: boolean;
  manufacturerResolverLoaded: boolean;
  /** The version the ML process is serving, resolved from its artifact checksum. */
  runningModelVersion: string | null;
  /** The version recorded by the deployment tool, when it differs from the above. */
  recordedModelVersion: string | null;
  /** True when production holds a different artifact than the running process. */
  reloadPending: boolean;
  activeTrainingRunId: string | null;
  lastSuccessfulTraining: MlTrainingRunSummaryDto | null;
}

export interface MlEvaluationMetricsDto {
  candidateTop1Accuracy?: number;
  candidateTop3Accuracy?: number;
  activeModelTop1Accuracy?: number;
  activeModelTop3Accuracy?: number;
  manufacturerAccuracy?: number;
  duplicatePrecision?: number;
  duplicateRecall?: number;
  criticalFalsePositives?: number;
  latencyMs?: { p50?: number; p95?: number; p99?: number };
  modelSizeBytes?: number;
  peakMemoryMb?: number;
  unverifiedProvenanceCount?: number;
}

export interface MlGateResultDto {
  gate: string;
  passed: boolean;
  /** What the gate means, from the runner's own threshold table. */
  description?: string;
  threshold?: number;
}

export interface MlGateSummaryDto {
  gates: MlGateResultDto[];
  promotionEligible: boolean;
  /** True when the evaluator reported no gate verdicts at all. */
  unavailable: boolean;
}

export interface MlTrainingRunSummaryDto {
  id: string;
  status: TrainingRunStatus;
  phase: TrainingPhase | null;
  triggeredAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  triggeredByEmail: string | null;
  baseModelVersion: string | null;
  candidateModelVersion: string | null;
  datasetVersion: string | null;
  datasetFingerprint: string | null;
  trainingRecordCount: number | null;
  validationRecordCount: number | null;
  promotionEligible: boolean | null;
  deploymentStatus: DeploymentStatus;
}

export interface MlTrainingRunDetailDto extends MlTrainingRunSummaryDto {
  dataset: {
    version: string | null;
    fingerprint: string | null;
    recordCount: number | null;
    feedbackRecordCount: number | null;
    trainingRecordCount: number | null;
    validationRecordCount: number | null;
    quarantineRecordCount: number | null;
  };
  evaluation: MlEvaluationMetricsDto | null;
  gates: MlGateSummaryDto;
  artifact: {
    reference: string | null;
    checksum: string | null;
    exists: boolean;
    deployable: boolean;
  };
  deployment: {
    status: DeploymentStatus;
    modelVersion: string | null;
    deployedAt: string | null;
    deployedByEmail: string | null;
    previousModelVersion: string | null;
    runningModelVersion: string | null;
    reloadPending: boolean;
    reloadError: string | null;
  };
  failure: {
    errorCode: string | null;
    errorMessage: string | null;
    logExcerpt: string | null;
  };
  /** A background thread cannot be interrupted safely; always false today. */
  cancellable: boolean;
}

export interface MlTrainingRunPageDto {
  items: MlTrainingRunSummaryDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface MlModelVersionDto {
  version: string;
  createdAt: string | null;
  artifactExists: boolean;
  artifactChecksum: string | null;
  artifactSizeBytes: number | null;
  championModel: string | null;
  datasetVersion: string | null;
  deployable: boolean;
  /**
   * Whether the run that produced this version can still be deployed from here.
   *
   * `deployable` describes the artifact (it exists and its gates passed); this
   * describes the operator action, which the server also requires the RUN to allow.
   * A candidate that was already deployed (or whose run failed after training) has a
   * deployable artifact but no deployable run, and offering the button anyway would
   * produce a guaranteed 409.
   */
  runDeployable: boolean;
  metrics: MlEvaluationMetricsDto | null;
  gates: MlGateSummaryDto;
  /** Set when a training run in this database produced the version. */
  trainingRunId: string | null;
}

export interface MlModelsDto {
  /** What is on disk in production, with its version resolved by checksum. */
  production: {
    artifactVersion: string | null;
    recordedVersion: string | null;
    deployedAt: string | null;
    checksum: string | null;
    sizeBytes: number | null;
    rollbackAvailable: boolean;
  };
  /** What the running ML process actually serves. */
  running: {
    version: string | null;
    loaded: boolean;
    loadedAt: string | null;
    checksum: string | null;
    reloadPending: boolean;
  };
  versions: MlModelVersionDto[];
  deployments: MlDeploymentRecordDto[];
  available: boolean;
}

export interface MlDeploymentRecordDto {
  id: string;
  modelVersion: string;
  previousModelVersion: string | null;
  deploymentType: DeploymentType;
  status: DeploymentStatus;
  runningModelVersion: string | null;
  reloadPending: boolean;
  deployedByEmail: string | null;
  deployedAt: string;
  trainingRunId: string | null;
}

export interface MlDatasetDto {
  available: boolean;
  current: {
    version: string;
    generatedAt: string | null;
    fingerprint: string | null;
    totalRecords: number | null;
    validatedRecords: number | null;
    quarantinedRecords: number | null;
    trainingRecords: number | null;
    evaluationRecords: number | null;
    expandedExamples: number | null;
    duplicatePairs: number | null;
    distinctBaseFamilies: number | null;
    dataLeakageVerified: boolean | null;
    categories: string[];
  } | null;
  freshness: {
    ageHours: number | null;
    lastTrainingRunAt: string | null;
    recordsSinceLastTraining: number | null;
  };
  quality: {
    duplicatePairs: number | null;
    conflictingLabels: number | null;
    missingFields: number | null;
    quarantineTotal: number | null;
    quarantineByReason: Array<{ reason: string; count: number }>;
    categoryDistribution: Array<{ name: string; count: number }>;
    manufacturerDistribution: Array<{ name: string; count: number }>;
    distinctBaseFamilies: number | null;
    validatedRecordCount: number | null;
  };
  history: Array<{
    version: string;
    generatedAt: string | null;
    totalRecords: number | null;
    trainingRecords: number | null;
    evaluationRecords: number | null;
  }>;
}

export interface MlUsageDto {
  feedback: {
    total: number;
    accepted: number;
    rejected: number;
    edited: number;
    sinceLastTraining: number | null;
    usedInLastTraining: number | null;
    bySuggestionType: Array<{ suggestionType: string; count: number }>;
  };
  findings: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    dismissed: number;
    stale: number;
    applied: number;
    byIssueCategory: Array<{ issueCategory: string; count: number }>;
  };
  training: {
    totalRuns: number;
    passed: number;
    rejected: number;
    failed: number;
    active: number;
    deployments: number;
    rollbacks: number;
  };
  /** Every block states whether the numbers behind it exist at all. */
  available: {
    feedback: boolean;
    findings: boolean;
    training: boolean;
  };
}

export interface MlOverviewDto {
  health: MlHealthDto;
  productionModel: {
    artifactVersion: string | null;
    runningVersion: string | null;
    reloadPending: boolean;
    deployedAt: string | null;
    datasetVersion: string | null;
    status: 'RUNNING' | 'RELOAD_PENDING' | 'UNKNOWN';
  } | null;
  latestRun: MlTrainingRunSummaryDto | null;
  candidate: {
    runId: string;
    modelVersion: string | null;
    promotionEligible: boolean | null;
    deployable: boolean;
    deployed: boolean;
  } | null;
  dataset: MlDatasetDto['current'];
  counts: {
    feedback: number;
    findings: number;
    trainingRuns: number;
    deployedModels: number;
  };
}
