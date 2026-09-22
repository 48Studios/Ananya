import { apiClient } from "../api-client";

/**
 * ML Operations API client.
 *
 * Every route behind this module is administrator-only on the server
 * (`MlAdminGuard` = `Administration.Roles`); the page that uses it is additionally
 * wrapped in `PermissionGuard`. Nothing here sends an actor identity — the server
 * derives it from the session, and a request that carries one is rejected with 400.
 */

export type TrainingRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "EVALUATING"
  | "PASSED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED";

export type TrainingPhase =
  | "PREPARING_DATASET"
  | "TRAINING"
  | "EVALUATING"
  | "PACKAGING"
  | "COMPLETED";

export type DeploymentStatus =
  | "NOT_DEPLOYED"
  | "DEPLOYED"
  | "DEPLOYED_PENDING_RELOAD"
  | "DEPLOYMENT_FAILED";

export type DeploymentType = "CANDIDATE" | "ROLLBACK";

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
  description?: string;
  threshold?: number;
}

export interface MlGateSummaryDto {
  gates: MlGateResultDto[];
  promotionEligible: boolean;
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
  cancellable: boolean;
}

export interface MlTrainingRunPageDto {
  items: MlTrainingRunSummaryDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface MlHealthDto {
  serviceReachable: boolean;
  serviceEnabled: boolean;
  ready: boolean;
  modelsLoaded: Record<string, boolean>;
  categoryModelLoaded: boolean;
  manufacturerResolverLoaded: boolean;
  runningModelVersion: string | null;
  recordedModelVersion: string | null;
  reloadPending: boolean;
  activeTrainingRunId: string | null;
  lastSuccessfulTraining: MlTrainingRunSummaryDto | null;
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
  /** Whether the run that produced this version can still be deployed. */
  runDeployable: boolean;
  metrics: MlEvaluationMetricsDto | null;
  gates: MlGateSummaryDto;
  trainingRunId: string | null;
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

export interface MlModelsDto {
  production: {
    artifactVersion: string | null;
    recordedVersion: string | null;
    deployedAt: string | null;
    checksum: string | null;
    sizeBytes: number | null;
    rollbackAvailable: boolean;
  };
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
  available: { feedback: boolean; findings: boolean; training: boolean };
}

export interface MlOverviewDto {
  health: MlHealthDto;
  productionModel: {
    artifactVersion: string | null;
    runningVersion: string | null;
    reloadPending: boolean;
    deployedAt: string | null;
    datasetVersion: string | null;
    status: "RUNNING" | "RELOAD_PENDING" | "UNKNOWN";
  } | null;
  latestRun: MlTrainingRunSummaryDto | null;
  candidate: {
    runId: string;
    modelVersion: string | null;
    promotionEligible: boolean | null;
    deployable: boolean;
    deployed: boolean;
  } | null;
  dataset: MlDatasetDto["current"];
  counts: {
    feedback: number;
    findings: number;
    trainingRuns: number;
    deployedModels: number;
  };
}

export interface ListTrainingRunsParams {
  page?: number;
  pageSize?: number;
  status?: TrainingRunStatus;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query.length > 0 ? `?${query}` : "";
}

export const mlOpsApi = {
  getHealth: (): Promise<MlHealthDto> => apiClient.get<MlHealthDto>("/ml/ops/health"),

  getOverview: (): Promise<MlOverviewDto> =>
    apiClient.get<MlOverviewDto>("/ml/ops/overview"),

  getModels: (): Promise<MlModelsDto> => apiClient.get<MlModelsDto>("/ml/ops/models"),

  getDataset: (): Promise<MlDatasetDto> =>
    apiClient.get<MlDatasetDto>("/ml/ops/datasets"),

  getUsage: (): Promise<MlUsageDto> => apiClient.get<MlUsageDto>("/ml/ops/usage"),

  listTrainingRuns: (
    params: ListTrainingRunsParams = {},
  ): Promise<MlTrainingRunPageDto> =>
    apiClient.get<MlTrainingRunPageDto>(
      `/ml/ops/training-runs${buildQuery({
        page: params.page,
        pageSize: params.pageSize,
        status: params.status,
      })}`,
    ),

  getTrainingRun: (id: string): Promise<MlTrainingRunDetailDto> =>
    apiClient.get<MlTrainingRunDetailDto>(`/ml/ops/training-runs/${id}`),

  /**
   * Starts a training run.
   *
   * The body is empty and stays empty: there is no version, dataset, path or
   * argument a client may supply, and the server rejects one with a 400.
   */
  triggerTrainingRun: (): Promise<MlTrainingRunDetailDto> =>
    apiClient.post<MlTrainingRunDetailDto, Record<string, never>>(
      "/ml/ops/training-runs",
      {},
    ),

  deployCandidate: (
    id: string,
    expectedCandidateVersion?: string,
  ): Promise<MlTrainingRunDetailDto> =>
    apiClient.post<MlTrainingRunDetailDto, { expectedCandidateVersion?: string }>(
      `/ml/ops/training-runs/${id}/deploy`,
      expectedCandidateVersion ? { expectedCandidateVersion } : {},
    ),

  rollback: (): Promise<MlDeploymentRecordDto> =>
    apiClient.post<MlDeploymentRecordDto, Record<string, never>>(
      "/ml/ops/models/rollback",
      {},
    ),

  reloadModel: (): Promise<MlModelsDto> =>
    apiClient.post<MlModelsDto, Record<string, never>>("/ml/ops/models/reload", {}),
};
